// Selected browser engine, production Next server/actions and an owned PostgreSQL fixture.
import assert from "node:assert/strict";
import { Client } from "pg";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { startHttpsReviewServer as startReviewServer, stopHttpsReviewServer as stopReviewServer } from "./review-https-server.mjs";
const engine = process.env.SHELF_REVIEW_BROWSER ?? "chromium";
assert(["chromium", "webkit", "firefox"].includes(engine), "Unsupported review browser");
const browserType = ({ chromium, webkit, firefox })[engine];
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.SHELF_REVIEW_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.SHELF_REVIEW_DB_PORT ?? "55443");
assert.equal(url.pathname, "/shelf_review");
const port = 3395, origin = `https://127.0.0.1:${port}`;
const brand = `review-import-browser-${Date.now()}`;
const otherBrand = brand + "-other";
const key = `shelf:import-recovery:v1:${brand}`;
const path = `/mc/${brand}/import`;
const raw = "- Fixture Amber $20 each\n- Fixture Birch $30 each\n- Fixture Cedar $40 each";
const client = new Client({ connectionString: process.env.DATABASE_URL });
const checks = [], errors = [], blocked = [];
let activeCheck = "setup";
let child, browser, fault = false, loseResponse = false, pairedRetries = false, pairedCount = 0, releasePair;
const pairReady = new Promise(resolve => { releasePair = resolve; });
async function counts() {
  return (await client.query('SELECT (SELECT count(*)::int FROM "Product" WHERE "brandId"=$1) AS products, (SELECT count(*)::int FROM "MenuImport" WHERE "brandId"=$1) AS imports, (SELECT count(*)::int FROM "AuditEvent" WHERE "brandId"=$1) AS audits', [brand])).rows[0];
}
async function check(name, run) { activeCheck = name; await run(); checks.push(name); }
async function clearFault() {
  if (!fault) return;
  await client.query('DROP TRIGGER review_browser_import_fault ON "AuditEvent"');
  await client.query('DROP FUNCTION review_browser_import_fault()');
  fault = false;
}
try {
  await client.connect();
  await client.query('INSERT INTO "Brand"(id,slug,name,vertical,"updatedAt") VALUES($1,$1,$2,\'OTHER\',NOW())', [brand, "Import browser fixture"]);
  await client.query('INSERT INTO "Brand"(id,slug,name,vertical,"updatedAt") VALUES($1,$1,$2,\'OTHER\',NOW())', [otherBrand, "Other recovery fixture"]);
  child = await startReviewServer(port);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
      blocked.push(request.url()); return route.abort();
    }
    if (pairedRetries && request.method() === "POST" && request.headers()["next-action"]) {
      const response = await route.fetch();
      pairedCount++;
      if (pairedCount === 2) releasePair();
      await pairReady;
      return route.fulfill({ response });
    }
    if (loseResponse && request.method() === "POST" && request.headers()["next-action"]) {
      loseResponse = false;
      // Forward to the real action and let its database transaction commit;
      // only the response delivery to the browser is deliberately lost.
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  let page = await context.newPage();
  page.on("pageerror", error => errors.push({ message: String(error), check: activeCheck }));
  let menu = page.getByLabel("Paste your chat menu", { exact: true });
  const submit = () => page.getByRole("button", { name: /^Import \d+ products?$/ });
  let status = page.getByRole("status");
  await check("real login returns to the protected import page", async () => {
    await page.goto(origin + path);
    await page.getByLabel("Password", { exact: true }).fill(process.env.MC_PASSWORD);
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    await expect(page).toHaveURL(origin + path); await expect(menu).toBeVisible();
  });
  await check("preview exclusions and empty selection do not write to the database", async () => {
    await menu.fill(raw);
    await expect(page.getByRole("checkbox")).toHaveCount(3);
    for (const name of ["Amber", "Birch", "Cedar"]) await page.getByLabel(`Include Fixture ${name}`, { exact: true }).uncheck();
    await expect(submit()).toBeDisabled();
    await page.getByLabel("Include Fixture Amber", { exact: true }).check();
    await page.getByLabel("Include Fixture Cedar", { exact: true }).check();
    await expect(submit()).toHaveText("Import 2 products");
    assert.deepEqual(await counts(), { products: 0, imports: 0, audits: 0 });
  });
  await check("audit failure rolls back drafts and preserves the browser selection for retry", async () => {
    await client.query(`CREATE FUNCTION review_browser_import_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."brandId" = '${brand}' THEN RAISE EXCEPTION 'owned browser fixture audit fault'; END IF; RETURN NEW; END $$`);
    await client.query('CREATE TRIGGER review_browser_import_fault BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION review_browser_import_fault()');
    fault = true;
    await submit().click();
    await expect(status).toContainText("Retry this selection");
    await expect(menu).toHaveValue(raw);
    await expect(page.getByLabel("Include Fixture Birch", { exact: true })).not.toBeChecked();
    await expect(submit()).toBeEnabled();
    assert.deepEqual(await counts(), { products: 0, imports: 0, audits: 0 });
    await clearFault();
    await page.reload();
    await expect(menu).toHaveValue(raw);
    await expect(menu).toBeDisabled();
    await expect(page.getByLabel("Include Fixture Birch", { exact: true })).not.toBeChecked();
    await expect(status).toContainText("unconfirmed");
    assert.deepEqual(await counts(), { products: 0, imports: 0, audits: 0 });
  });
  await check("retry saves only selected hidden drafts and prevents an immediate duplicate submission", async () => {
    await submit().click(); await expect(status).toContainText("Saved 2 drafts");
    await expect(submit()).toBeDisabled();
    assert.deepEqual(await counts(), { products: 2, imports: 1, audits: 1 });
    const rows = (await client.query('SELECT name,published FROM "Product" WHERE "brandId"=$1 ORDER BY name', [brand])).rows;
    assert.deepEqual(rows, [{ name: "Fixture Amber", published: false }, { name: "Fixture Cedar", published: false }]);
  });
  await check("lost response survives reload, brand navigation, closed tab and sign-in; simultaneous retries deduplicate", async () => {
    await page.getByRole("button", { name: "Start another import", exact: true }).click();
    await menu.fill("- Fixture Delta $50 each"); loseResponse = true;
    await submit().click();
    await expect(status).toContainText("Import could not be confirmed");
    assert.equal(loseResponse, false);
    assert.deepEqual(await counts(), { products: 3, imports: 2, audits: 2 });
    await expect(menu).toHaveValue("- Fixture Delta $50 each");
    const confirmation = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).id, key);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(menu).toHaveValue("- Fixture Delta $50 each");
    await expect(menu).toBeDisabled();
    await expect(status).toContainText("unconfirmed");
    assert.deepEqual(await counts(), { products: 3, imports: 2, audits: 2 });
    await page.waitForLoadState("networkidle");
    await page.goto(origin + `/mc/${otherBrand}/import`);
    await expect(page.getByLabel("Paste your chat menu", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Paste your chat menu", { exact: true })).toBeEnabled();
    // Settle unrelated sidebar prefetches before intentionally closing this tab.
    await page.waitForLoadState("networkidle");
    await page.close();
    page = await context.newPage(); page.on("pageerror", error => errors.push({ message: String(error), check: activeCheck }));
    menu = page.getByLabel("Paste your chat menu", { exact: true }); status = page.getByRole("status");
    await context.clearCookies();
    await page.goto(origin + path);
    await page.getByLabel("Password", { exact: true }).fill(process.env.MC_PASSWORD);
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    await expect(menu).toHaveValue("- Fixture Delta $50 each");
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).id, key), confirmation);
    const second = await context.newPage(); second.on("pageerror", error => errors.push({ message: String(error), check: activeCheck }));
    await second.goto(origin + path);
    await expect(second.getByLabel("Paste your chat menu", { exact: true })).toHaveValue("- Fixture Delta $50 each");
    pairedRetries = true;
    await Promise.all([submit().click(), second.getByRole("button", { name: /^Import 1 product$/ }).click()]);
    await expect(status).toContainText("Saved 1 draft");
    await expect(second.getByRole("status")).toContainText("Saved 1 draft");
    assert.equal(pairedCount, 2); pairedRetries = false;
    assert.deepEqual(await counts(), { products: 3, imports: 2, audits: 2 });
    const receipt = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(receipt.phase, "confirmed"); assert.equal(receipt.raw, undefined); assert.equal(receipt.lineNumbers, undefined);
    await second.waitForLoadState("networkidle");
    await second.close();
  });
  await check("mobile import stays within the viewport and opens inventory with saved drafts", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Start another import", exact: true }).click();
    await menu.fill(raw);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await menu.fill("- Fixture Mobile $60 each");
    await submit().click(); await expect(status).toContainText("Saved 1 draft");
    await page.getByRole("link", { name: "Review in Inventory", exact: true }).click();
    await expect(page).toHaveURL(origin + `/mc/${brand}/inventory`);
    await expect(page.getByText("Fixture Mobile", { exact: true })).toBeVisible();
    assert.deepEqual(await counts(), { products: 4, imports: 3, audits: 3 });
  });
  await check("quota failure prevents dispatch and lets the unchanged selection resume when storage returns", async () => {
    await page.goto(origin + path);
    await page.getByRole("button", { name: "Start another import", exact: true }).click();
    await menu.fill("- Quota fixture");
    await page.evaluate(() => {
      window.restoreStorageWrite = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key.startsWith("shelf:import-recovery:")) throw new DOMException("Full", "QuotaExceededError"); return window.restoreStorageWrite.call(this, key, value); };
    });
    await submit().click(); await expect(page.getByRole("alert").filter({ hasText: /[Bb]rowser/ })).toContainText("could not be read or saved");
    assert.deepEqual(await counts(), { products: 4, imports: 3, audits: 3 });
    await expect(menu).toHaveValue("- Quota fixture");
    await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorageWrite; });
    await page.getByRole("button", { name: "Check recovery storage", exact: true }).click();
    await expect(submit()).toBeEnabled();
  });
  await check("corrupt storage is preserved until explicit discard and never dispatches", async () => {
    await page.evaluate(key => localStorage.setItem(key, "{broken"), key);
    await page.reload(); await expect(page.getByRole("alert").filter({ hasText: /[Bb]rowser/ })).toContainText("could not be read or saved");
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Discard recovery copy", exact: true }).click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), "{broken");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Discard recovery copy", exact: true }).click();
    await expect(menu).toBeEnabled(); await expect(menu).toHaveValue("");
    assert.deepEqual(await counts(), { products: 4, imports: 3, audits: 3 });
  });
  await check("blocked storage disables importing without contacting the action", async () => {
    const isolated = await browser.newContext({ ignoreHTTPSErrors: true });
    await isolated.addCookies(await context.cookies());
    await isolated.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await isolated.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } }));
    const blockedPage = await isolated.newPage();
    await blockedPage.goto(origin + path);
    await expect(blockedPage.getByRole("alert").filter({ hasText: /[Bb]rowser/ })).toContainText("could not be read or saved");
    await expect(blockedPage.getByLabel("Paste your chat menu", { exact: true })).toBeDisabled();
    assert.deepEqual(await counts(), { products: 4, imports: 3, audits: 3 });
    await isolated.close();
  });
  await check("failed success cleanup retains known success; reload retries the same committed import", async () => {
    await menu.fill("- Cleanup fixture");
    await page.evaluate(() => {
      window.restoreStorageWrite = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("shelf:import-recovery:") && JSON.parse(value).phase === "confirmed") throw new DOMException("Full", "QuotaExceededError");
        return window.restoreStorageWrite.call(this, key, value);
      };
    });
    await submit().click(); await expect(status).toContainText("Saved 1 draft");
    await expect(page.getByRole("alert").filter({ hasText: /[Bb]rowser/ })).toContainText("Saved on the server");
    await expect(submit()).toBeDisabled();
    assert.deepEqual(await counts(), { products: 5, imports: 4, audits: 4 });
    const id = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).id, key);
    await page.reload(); await expect(status).toContainText("unconfirmed");
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).id, key), id);
    await submit().click(); await expect(status).toContainText("Saved 1 draft");
    assert.deepEqual(await counts(), { products: 5, imports: 4, audits: 4 });
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).raw, key), undefined);
  });
  await check("discarding an uncertain committed import warns, clears its local menu and does not undo server drafts", async () => {
    await page.getByRole("button", { name: "Start another import", exact: true }).click();
    await menu.fill("- Discard fixture"); loseResponse = true;
    await submit().click(); await expect(status).toContainText("could not be confirmed");
    assert.deepEqual(await counts(), { products: 6, imports: 5, audits: 5 });
    page.once("dialog", dialog => { assert.match(dialog.message(), /does not undo/); return dialog.accept(); });
    await page.getByRole("button", { name: "Discard recovery copy", exact: true }).click();
    await expect(menu).toBeEnabled(); await expect(menu).toHaveValue("");
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).raw, key), undefined);
    assert.deepEqual(await counts(), { products: 6, imports: 5, audits: 5 });
  });
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  console.log(JSON.stringify({ engine, checks, pageErrors: errors, blockedRequests: blocked }, null, 2));
} finally {
  releasePair();
  await browser?.close(); await stopReviewServer(child);
  await clearFault();
  await client.query('DELETE FROM "AuditEvent" WHERE "brandId"=$1', [brand]);
  await client.query('DELETE FROM "Brand" WHERE id IN ($1,$2)', [brand, otherBrand]);
  await client.end();
}
