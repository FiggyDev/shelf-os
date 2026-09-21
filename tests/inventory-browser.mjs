// Selected browser engine + built Next server + an explicitly owned PostgreSQL fixture.
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
const port = 3394;
const origin = `https://127.0.0.1:${port}`;
const brand = `review-browser-${Date.now()}`;
const product = brand + "-product";
const path = `/mc/${brand}/inventory`;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const checks = [], errors = [], blocked = [];
let child, browser;
let holdScripts = false;
let releaseScripts;
const scriptsReleased = new Promise(resolve => { releaseScripts = resolve; });
async function check(name, fn) { await fn(); checks.push(name); }
async function row() { return (await client.query('SELECT name FROM "Product" WHERE id=$1', [product])).rows[0].name; }
async function audits() { return (await client.query('SELECT count(*)::int AS count FROM "AuditEvent" WHERE "entityId"=$1', [product])).rows[0].count; }
async function open(page) { await page.locator('button[aria-expanded="false"]').click(); await expect(page.getByLabel("Product name", { exact: true })).toBeVisible(); }
async function save(page, name) {
  const revision = await page.locator('input[name="revision"]').inputValue();
  await page.getByLabel("Product name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(row).toBe(name);
  await expect(page.locator('input[name="revision"]')).not.toHaveValue(revision);
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(name);
}
try {
  await client.connect();
  await client.query('INSERT INTO "Brand"(id,slug,name,"updatedAt") VALUES($1,$1,$2,NOW())', [brand, "Browser fixture"]);
  await client.query('INSERT INTO "Product"(id,"brandId",slug,name,"updatedAt") VALUES($1,$2,$1,$3,NOW())', [product, brand, "Original fixture"]);
  child = await startReviewServer(port);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.route("**/*", async route => {
    if (new URL(route.request().url()).origin === origin) {
      if (holdScripts && route.request().resourceType() === "script") await scriptsReleased;
      return route.continue();
    }
    blocked.push(route.request().url()); await route.abort();
  });
  context.on("page", page => page.on("pageerror", error => errors.push(String(error))));
  const first = await context.newPage();
  await check("real login protects inventory and returns to requested brand", async () => {
    await first.goto(origin + path);
    await expect(first.getByRole("button", { name: "Enter", exact: true })).toBeVisible();
    await first.getByLabel("Password", { exact: true }).fill(process.env.MC_PASSWORD);
    await first.getByRole("button", { name: "Enter", exact: true }).click();
    await expect(first).toHaveURL(origin + path);
    await open(first);
  });
  const second = await context.newPage();
  await second.goto(origin + path); await open(second);
  await check("first editor saves through the real server action without losing entered values", async () => {
    await save(first, "First browser save"); assert.equal(await audits(), 1);
  });
  await check("stale second editor preserves edits and cannot overwrite the first", async () => {
    await second.getByLabel("Product name", { exact: true }).fill("Unsaved second edit");
    await second.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(second.locator("form").getByRole("alert")).toContainText("changed since you opened");
    await expect(second.getByLabel("Product name", { exact: true })).toHaveValue("Unsaved second edit");
    assert.equal(await row(), "First browser save"); assert.equal(await audits(), 1);
  });
  await check("reload disables the editor until JavaScript is ready, then saves the current revision", async () => {
    holdScripts = true;
    await second.getByRole("button", { name: "Reload inventory", exact: true }).click();
    await expect(second.locator('button[aria-expanded="false"]')).toBeVisible();
    await expect(second.locator('button[aria-expanded="false"]')).toBeDisabled();
    holdScripts = false;
    releaseScripts();
    await open(second); await expect(second.getByLabel("Product name", { exact: true })).toHaveValue("First browser save");
    await save(second, "Fresh browser save"); assert.equal(await audits(), 2);
  });
  await check("repeated save advances the baseline without requiring reopen", async () => {
    await save(second, "Repeated browser save"); assert.equal(await audits(), 3);
  });
  await check("server validation preserves entered values and creates no audit", async () => {
    await second.getByLabel("Product name", { exact: true }).fill("   ");
    await second.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(second.locator("form").getByRole("alert")).toBeVisible();
    await expect(second.getByLabel("Product name", { exact: true })).toHaveValue("   ");
    assert.equal(await row(), "Repeated browser save"); assert.equal(await audits(), 3);
    await save(second, "Recovered browser save"); assert.equal(await audits(), 4);
  });
  await check("mobile editor can reopen and save without horizontal overflow", async () => {
    await second.setViewportSize({ width: 390, height: 844 });
    await second.reload(); await open(second); await save(second, "Mobile browser save");
    assert.equal(await audits(), 5);
    assert.equal(await second.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  console.log(JSON.stringify({ engine, checks, pageErrors: errors, blockedRequests: blocked }, null, 2));
} finally {
  releaseScripts();
  await browser?.close(); await stopReviewServer(child);
  await client.query('DELETE FROM "AuditEvent" WHERE "entityId"=$1', [product]);
  await client.query('DELETE FROM "Brand" WHERE id=$1', [brand]);
  await client.end();
}
