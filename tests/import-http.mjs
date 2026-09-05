import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.js";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.SHELF_REVIEW_DB, "1");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55443"); assert.equal(url.pathname, "/shelf_review");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const base = "http://127.0.0.1:3391", brandId = "review-import-brand", originalId = "review-import-original";
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const action = Object.entries(manifest.node).find(([, value]) => value.exportedName === "importMenu")[0];
const raw = "FLOWER\nTIER 1 - $40/8th\n- Blue Dream (H)\n- Gelato 41 (I) SOLD OUT\n- Sour Diesel (S)";
let child; const checks = [];
const requestId = randomUUID();
const expires = Date.now() + 120000;
const cookie = "mc_session=" + expires + "." + createHmac("sha256", process.env.MC_SESSION_SECRET).update(String(expires)).digest("hex");
const payload = (overrides = {}) => ({ brandSlug: brandId, raw, lineNumbers: [3,4], requestId, ...overrides });
async function request(input, authenticated = true) {
 const response = await fetch(base + "/mc/" + brandId + "/import", { method: "POST", redirect: "manual", headers: { "Next-Action": action, Origin: base, ...(authenticated ? { Cookie: cookie } : {}) }, body: await encodeReply([input]) });
 return { status: response.status, text: await response.text() };
}
async function counts() {
 return (await client.query('SELECT (SELECT count(*)::int FROM "Product" WHERE "brandId"=$1) AS products, (SELECT count(*)::int FROM "MenuImport" WHERE "brandId"=$1) AS imports, (SELECT count(*)::int FROM "AuditEvent" WHERE "brandId"=$1) AS audits',[brandId])).rows[0];
}
async function check(name, run) { await run(); checks.push({ name, passed:true }); }
(async()=>{
 await client.connect();
 await client.query('INSERT INTO "Brand"(id,slug,name,"updatedAt") VALUES($1,$1,$2,NOW())',[brandId,"Import fixture brand"]);
 await client.query('INSERT INTO "Product"(id,"brandId",slug,name,published,"updatedAt") VALUES($1,$2,$1,$3,true,NOW())',[originalId,brandId,"Blue Dream"]);
 child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3391"],{stdio:"ignore"});
 let ready=false; for(let i=0;i<100;i++){try{await fetch(base+"/login");ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}} assert.ok(ready);
 await check("anonymous confirmation creates nothing",async()=>{
  assert.equal((await request(payload(),false)).status,307); assert.deepEqual(await counts(),{products:1,imports:0,audits:0});
 });
 await check("concurrent confirmations create only selected drafts once with source context",async()=>{
  const results=await Promise.all([request(payload()),request(payload())]);
  for(const result of results)assert.match(result.text,/"ok":true/);
  assert.deepEqual(await counts(),{products:3,imports:1,audits:1});
  const rows=(await client.query('SELECT name,published,"importNotes","strainType" FROM "Product" WHERE "brandId"=$1 AND id<>$2 ORDER BY name',[brandId,originalId])).rows;
  assert.deepEqual(rows.map(row=>row.name),["Blue Dream","Gelato 41"]);
  assert.ok(rows.every(row=>row.published===false));
  assert.equal(rows[0].strainType,"HYBRID"); assert.equal(rows[1].strainType,"INDICA");
  assert.match(rows[1].importNotes,/Sold out/); assert.match(rows[0].importNotes,/\$40.00\/8th/); assert.match(rows[0].importNotes,/TIER 1/);
  const sizes=(await client.query('SELECT v.size FROM "ProductVariant" v JOIN "Product" p ON p.id=v."productId" WHERE p."brandId"=$1',[brandId])).rows;
  assert.deepEqual(sizes.map(row=>row.size),["8th","8th"]);
  assert.equal((await client.query('SELECT published FROM "Product" WHERE id=$1',[originalId])).rows[0].published,true);
  const audit=(await client.query('SELECT "actorId",metadata FROM "AuditEvent" WHERE "brandId"=$1',[brandId])).rows[0];
  assert.equal(audit.actorId,null);assert.equal(audit.metadata.authentication,"shared_password");
 });
 await check("retry returns original success without duplicates",async()=>{
  assert.match((await request(payload())).text,/"ok":true/);assert.deepEqual(await counts(),{products:3,imports:1,audits:1});
 });
 await check("reused confirmation with changed content is rejected",async()=>{
  assert.match((await request(payload({raw:raw+"\n- New Item $20"}))).text,/"ok":false/);assert.deepEqual(await counts(),{products:3,imports:1,audits:1});
 });
 for(const [name,overrides] of [["invalid selected row",{lineNumbers:[999]}],["empty selection",{lineNumbers:[]}],["oversize input",{raw:"x".repeat(50001)}],["missing brand",{brandSlug:"review-import-missing"}]]) {
  await check(name+" creates nothing",async()=>{assert.match((await request(payload({...overrides,requestId:randomUUID()}))).text,/"ok":false/);assert.deepEqual(await counts(),{products:3,imports:1,audits:1});});
 }
 await check("audit failure rolls back all drafts and confirmation; retry then succeeds",async()=>{
  const retryId=randomUUID();
  await client.query(`CREATE FUNCTION review_import_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."brandId" = 'review-import-brand' THEN RAISE EXCEPTION 'review import audit failure'; END IF; RETURN NEW; END $$`);
  await client.query('CREATE TRIGGER review_import_reject_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION review_import_reject_audit()');
  try { assert.match((await request(payload({requestId:retryId}))).text,/"ok":false/);assert.deepEqual(await counts(),{products:3,imports:1,audits:1}); }
  finally {await client.query('DROP TRIGGER review_import_reject_audit ON "AuditEvent"');await client.query('DROP FUNCTION review_import_reject_audit()');}
  assert.match((await request(payload({requestId:retryId}))).text,/"ok":true/);assert.deepEqual(await counts(),{products:5,imports:2,audits:2});
 });
 console.log(JSON.stringify({checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve));child.kill("SIGTERM");await exited;}
 await client.query('DELETE FROM "AuditEvent" WHERE "brandId"=$1',[brandId]);
 await client.query('DELETE FROM "Brand" WHERE id=$1',[brandId]);await client.end();
});
