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
const path = `/mc/${brand}/import`;
const raw = "- Fixture Amber $20 each\n- Fixture Birch $30 each\n- Fixture Cedar $40 each";
const client = new Client({ connectionString: process.env.DATABASE_URL });
const checks = [], errors = [], blocked = [];
let child, browser, fault = false, loseResponse = false;
async function counts() {
  return (await client.query('SELECT (SELECT count(*)::int FROM "Product" WHERE "brandId"=$1) AS products, (SELECT count(*)::int FROM "MenuImport" WHERE "brandId"=$1) AS imports, (SELECT count(*)::int FROM "AuditEvent" WHERE "brandId"=$1) AS audits', [brand])).rows[0];
}
async function check(name, run) { await run(); checks.push(name); }
async function clearFault() {
  if (!fault) return;
  await client.query('DROP TRIGGER review_browser_import_fault ON "AuditEvent"');
  await client.query('DROP FUNCTION review_browser_import_fault()');
  fault = false;
}
try {
  await client.connect();
  await client.query('INSERT INTO "Brand"(id,slug,name,vertical,"updatedAt") VALUES($1,$1,$2,\'OTHER\',NOW())', [brand, "Import browser fixture"]);
  child = await startReviewServer(port);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
      blocked.push(request.url()); return route.abort();
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
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  const menu = page.getByLabel("Paste your chat menu", { exact: true });
  const submit = () => page.getByRole("button", { name: /^Import \d+ products?$/ });
  const status = page.getByRole("status");
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
  });
  await check("retry saves only selected hidden drafts and prevents an immediate duplicate submission", async () => {
    await submit().click(); await expect(status).toContainText("Saved 2 drafts");
    await expect(submit()).toBeDisabled();
    assert.deepEqual(await counts(), { products: 2, imports: 1, audits: 1 });
    const rows = (await client.query('SELECT name,published FROM "Product" WHERE "brandId"=$1 ORDER BY name', [brand])).rows;
    assert.deepEqual(rows, [{ name: "Fixture Amber", published: false }, { name: "Fixture Cedar", published: false }]);
  });
  await check("a committed import with a lost response retries without duplicate drafts or audit", async () => {
    await menu.fill("- Fixture Delta $50 each"); loseResponse = true;
    await submit().click();
    await expect(status).toContainText("Import could not be confirmed");
    assert.equal(loseResponse, false);
    assert.deepEqual(await counts(), { products: 3, imports: 2, audits: 2 });
    await expect(menu).toHaveValue("- Fixture Delta $50 each");
    await submit().click(); await expect(status).toContainText("Saved 1 draft");
    assert.deepEqual(await counts(), { products: 3, imports: 2, audits: 2 });
  });
  await check("mobile import stays within the viewport and opens inventory with saved drafts", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await menu.fill(raw);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await menu.fill("- Fixture Mobile $60 each");
    await submit().click(); await expect(status).toContainText("Saved 1 draft");
    await page.getByRole("link", { name: "Review in Inventory", exact: true }).click();
    await expect(page).toHaveURL(origin + `/mc/${brand}/inventory`);
    await expect(page.getByText("Fixture Mobile", { exact: true })).toBeVisible();
    assert.deepEqual(await counts(), { products: 4, imports: 3, audits: 3 });
  });
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  console.log(JSON.stringify({ engine, checks, pageErrors: errors, blockedRequests: blocked }, null, 2));
} finally {
  await browser?.close(); await stopReviewServer(child);
  await clearFault();
  await client.query('DELETE FROM "AuditEvent" WHERE "brandId"=$1', [brand]);
  await client.query('DELETE FROM "Brand" WHERE id=$1', [brand]);
  await client.end();
}
