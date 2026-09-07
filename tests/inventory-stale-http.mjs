// Built-app form snapshots and sequential stale edits against owned PostgreSQL.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { Client } from "pg";
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.js";
import { startReviewServer, stopReviewServer } from "./review-server.mjs";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.SHELF_REVIEW_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.SHELF_REVIEW_DB_PORT ?? "55443");
assert.equal(url.pathname, "/shelf_review");
const base = "http://127.0.0.1:3393";
const brandId = "review-stale-brand";
const productId = "review-stale-product";
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const action = name => Object.entries(manifest.node).find(([, v]) => v.exportedName === name)[0];
const client = new Client({ connectionString: process.env.DATABASE_URL });
let child;
const checks = [];
const expires = Date.now() + 60000;
const session = "mc_session=" + expires + "." + createHmac("sha256", process.env.MC_SESSION_SECRET).update(String(expires)).digest("hex");
async function post(name, args) {
  const r = await fetch(base + `/mc/${brandId}/inventory`, { method: "POST", headers: { "Next-Action": action(name), Origin: base, Cookie: session }, body: await encodeReply(args), signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  assert.equal(r.status, 200);
  return text;
}
async function snapshot() {
  const row = (await client.query('SELECT name,category,description,published FROM "Product" WHERE id=$1', [productId])).rows[0];
  return createHash("sha256").update(JSON.stringify([row.name,row.category,row.description,row.published])).digest("hex");
}
function edit(name, revision) {
  const form = new FormData();
  for (const [k,v] of Object.entries({ productId, brandSlug: brandId, revision, name, category: "Review", description: "Fixture" })) form.set(k,v);
  return post("updateProduct", [null, form]);
}
async function check(name, fn) {
  try { await fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: String(error) }); }
}
try {
  await client.connect();
  await client.query('INSERT INTO "Brand"(id,slug,name,"updatedAt") VALUES($1,$1,$2,NOW())', [brandId, "Race fixture"]);
  await client.query('INSERT INTO "Product"(id,"brandId",slug,name,"updatedAt") VALUES($1,$2,$1,$3,NOW())', [productId, brandId, "Original"]);
  child = await startReviewServer(3393);
  await check("stale form cannot overwrite a saved edit", async () => {
    const revision = await snapshot();
    await edit("First saved edit", revision);
    const response = await edit("Stale replacement", revision);
    assert.equal((await client.query('SELECT name FROM "Product" WHERE id=$1', [productId])).rows[0].name, "First saved edit");
    assert.match(response, /changed since you opened/);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "AuditEvent" WHERE "entityId"=$1', [productId])).rows[0].count, 1);
  });
  await check("refreshed form saves and returns its new revision", async () => {
    const response = await edit("Fresh replacement", await snapshot());
    assert.equal((await client.query('SELECT name FROM "Product" WHERE id=$1', [productId])).rows[0].name, "Fresh replacement");
    assert.ok(response.includes(await snapshot()));
  });
  await check("missing revision cannot overwrite a current product", async () => {
    const before = await snapshot();
    await edit("Missing revision", "");
    assert.equal(await snapshot(), before);
  });
  console.log(JSON.stringify({ checks }, null, 2));
  assert.ok(checks.every(c => c.passed), "inventory concurrency checks failed");
} finally {
  await stopReviewServer(child);
  await client.query('DELETE FROM "AuditEvent" WHERE "entityId"=$1', [productId]);
  await client.query('DELETE FROM "Brand" WHERE id=$1', [brandId]);
  await client.end();
}
