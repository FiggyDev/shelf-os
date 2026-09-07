// Two independent built-app requests, held at an owned PostgreSQL row lock.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.js";
import { startReviewServer, stopReviewServer } from "./review-server.mjs";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.SHELF_REVIEW_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.SHELF_REVIEW_DB_PORT ?? "55443");
assert.equal(url.pathname, "/shelf_review");
const base = "http://127.0.0.1:3392";
const brandId = "review-race-brand";
const productId = "review-race-product";
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const action = name => Object.entries(manifest.node).find(([, v]) => v.exportedName === name)[0];
const client = new Client({ connectionString: process.env.DATABASE_URL });
const observer = new Client({ connectionString: process.env.DATABASE_URL });
let child;
const checks = [];
const expires = Date.now() + 60000;
const session = "mc_session=" + expires + "." + createHmac("sha256", process.env.MC_SESSION_SECRET).update(String(expires)).digest("hex");
async function post(name, args) {
  const r = await fetch(base + `/mc/${brandId}/inventory`, { method: "POST", headers: { "Next-Action": action(name), Origin: base, Cookie: session }, body: await encodeReply(args), signal: AbortSignal.timeout(10000) });
  await r.text();
  assert.equal(r.status, 200);
}
function edit(name) {
  const form = new FormData();
  for (const [k,v] of Object.entries({ productId, brandSlug: brandId, name, category: "Review", description: "Fixture" })) form.set(k,v);
  return post("updateProduct", [null, form]);
}
async function contend(calls) {
  await client.query("BEGIN");
  await client.query('SELECT id FROM "Product" WHERE id=$1 FOR UPDATE', [productId]);
  const responses = Promise.allSettled(calls.map(call => call()));
  try {
    const deadline = Date.now() + 3000;
    let waiting = 0;
    while (Date.now() < deadline) {
      waiting = (await observer.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0].count;
      if (waiting >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(waiting >= 2, "both HTTP requests reached database contention");
  } finally { await client.query("COMMIT"); await responses; }
  const results = await responses;
  for (const result of results) if (result.status === "rejected") throw result.reason;
}
async function check(name, fn) {
  try { await fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: String(error) }); }
}
try {
  await client.connect(); await observer.connect();
  await client.query('INSERT INTO "Brand"(id,slug,name,"updatedAt") VALUES($1,$1,$2,NOW())', [brandId, "Race fixture"]);
  await client.query('INSERT INTO "Product"(id,"brandId",slug,name,"updatedAt") VALUES($1,$2,$1,$3,NOW())', [productId, brandId, "Original"]);
  child = await startReviewServer(3392);
  await check("two identical concurrent edits write only one audit", async () => {
    await contend([() => edit("Same"), () => edit("Same")]);
    assert.equal((await client.query('SELECT name FROM "Product" WHERE id=$1', [productId])).rows[0].name, "Same");
    const audits = (await client.query('SELECT action FROM "AuditEvent" WHERE "entityId"=$1', [productId])).rows;
    assert.equal(audits.length, 1);
  });
  await client.query('DELETE FROM "AuditEvent" WHERE "entityId"=$1', [productId]);
  await client.query('UPDATE "Product" SET published=false,name=$2 WHERE id=$1', [productId, "Original"]);
  await check("concurrent edits audit the actual preceding value", async () => {
    await contend([() => edit("First"), () => edit("Second")]);
    const audits = (await client.query('SELECT metadata FROM "AuditEvent" WHERE "entityId"=$1', [productId])).rows;
    assert.equal(audits.length, 2);
    const names = audits.flatMap(a => a.metadata.changes.filter(c => c.startsWith("name ")));
    assert.equal(names.filter(c => c.startsWith('name "Original"')).length, 1);
    const final = (await client.query('SELECT name FROM "Product" WHERE id=$1', [productId])).rows[0].name;
    const prior = final === "First" ? "Second" : "First";
    assert.ok(names.includes(`name "Original" → "${prior}"`));
    assert.ok(names.includes(`name "${prior}" → "${final}"`));
  });
  console.log(JSON.stringify({ checks }, null, 2));
  assert.ok(checks.every(c => c.passed), "inventory concurrency checks failed");
} finally {
  await stopReviewServer(child);
  await client.query('DELETE FROM "AuditEvent" WHERE "entityId"=$1', [productId]);
  await client.query('DELETE FROM "Brand" WHERE id=$1', [brandId]);
  await client.end(); await observer.end();
}
