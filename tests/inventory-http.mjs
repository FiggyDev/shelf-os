// Opt-in integration check against a built app and an isolated PostgreSQL DB.
// Run after prisma migrate deploy and pnpm build, with SHELF_REVIEW_DB=1.
import assert from "node:assert/strict";
import fs from "node:fs";
import { startReviewServer, stopReviewServer } from "./review-server.mjs";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.js";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.SHELF_REVIEW_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55443");
assert.equal(url.pathname, "/shelf_review");
assert.ok(process.env.MC_SESSION_SECRET);
const base = "http://127.0.0.1:3390";
const prefix = "review-http-";
const brandId = prefix + "brand";
const productId = prefix + "product";
const ownerId = prefix + "owner";
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const action = Object.entries(manifest.node).find(([, value]) => value.exportedName === "updateProduct")[0];
const client = new Client({ connectionString: process.env.DATABASE_URL });
let child;
const results = [];
function cookie(expires = Date.now() + 60000) {
  return "mc_session=" + expires + "." + createHmac("sha256", process.env.MC_SESSION_SECRET).update(String(expires)).digest("hex");
}
async function current() {
  return (await client.query('SELECT name FROM "Product" WHERE id=$1', [productId])).rows[0].name;
}
async function request(route, session, name, brandSlug = brandId) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ productId, brandSlug, name, category: "Review", description: "Fixture", published: "on" })) form.set(key, value);
  const response = await fetch(base + route, { method: "POST", headers: { "Next-Action": action, Origin: base, ...(session ? { Cookie: session } : {}) }, body: await encodeReply([null, form]), redirect: "manual" });
  await response.text();
  return response.status;
}
async function check(name, run) { await run(); results.push({ name, passed: true }); }
(async () => {
  await client.connect();
  await client.query('INSERT INTO "Brand"(id,slug,name,"updatedAt") VALUES($1,$1,$2,NOW())', [brandId, "Review HTTP Brand"]);
  await client.query('INSERT INTO "StaffUser"(id,"brandId",email,name,role,"updatedAt") VALUES($1,$2,$3,$4,$5,NOW())', [ownerId, brandId, "review@example.invalid", "Unrelated fixture owner", "OWNER"]);
  await client.query('INSERT INTO "Product"(id,"brandId",slug,name,"updatedAt") VALUES($1,$2,$1,$3,NOW())', [productId, brandId, "Original"]);
  child = await startReviewServer(3390);
  for (const [label, session] of [["anonymous", ""], ["invalid cookie", "mc_session=invalid"], ["expired cookie", cookie(Date.now() - 1000)]]) {
    await check(label + " cannot mutate", async () => {
      assert.equal(await request("/mc/" + brandId + "/inventory", session, "Rejected edit"), 307);
      assert.equal(await current(), "Original");
    });
  }
  for (const route of ["/", "/login"]) {
    await check("anonymous alternate action route " + route + " cannot mutate", async () => {
      await request(route, "", "Rejected edit");
      assert.equal(await current(), "Original");
    });
  }
  await check("shared login writes without assigning an unrelated staff identity", async () => {
    assert.equal(await request("/mc/" + brandId + "/inventory", cookie(), "Authorized edit"), 200);
    assert.equal(await current(), "Authorized edit");
    const audit = (await client.query('SELECT "actorId", metadata FROM "AuditEvent" WHERE "entityId"=$1', [productId])).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorId, null);
    assert.equal(audit[0].metadata.authentication, "shared_password");
  });
  await check("mismatched brand and product cannot mutate", async () => {
    await request("/mc/" + brandId + "/inventory", cookie(), "Wrong tenant edit", "another-brand");
    assert.equal(await current(), "Authorized edit");
  });
  await check("audit failure rolls back the product write", async () => {
    await client.query(`CREATE FUNCTION review_http_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityId" = 'review-http-product' THEN RAISE EXCEPTION 'review fixture audit failure'; END IF; RETURN NEW; END $$`);
    await client.query('CREATE TRIGGER review_http_reject_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION review_http_reject_audit()');
    try {
      await request("/mc/" + brandId + "/inventory", cookie(), "Must roll back");
      assert.equal(await current(), "Authorized edit");
      assert.equal((await client.query('SELECT count(*)::int AS count FROM "AuditEvent" WHERE "entityId"=$1', [productId])).rows[0].count, 1);
    } finally {
      await client.query('DROP TRIGGER review_http_reject_audit ON "AuditEvent"');
      await client.query('DROP FUNCTION review_http_reject_audit()');
    }
  });
  await check("audit page describes the shared login and historical attribution limits", async () => {
    const response = await fetch(base + "/mc/" + brandId + "/log", { headers: { Cookie: cookie() } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Shared-password session \(person unidentified\)/);
    assert.match(html, /not verified attribution/);
  });
  console.log(JSON.stringify({ checks: results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await stopReviewServer(child);
  await client.query('DELETE FROM "AuditEvent" WHERE "entityId"=$1', [productId]);
  await client.query('DELETE FROM "Brand" WHERE id=$1', [brandId]);
  await client.end();
});
