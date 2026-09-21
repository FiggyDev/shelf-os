import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { prepareImport, readImportRecovery, confirmImport, discardImport, recoveryRequest, recoveryKey } from "../src/lib/import-recovery";

function fixture() {
  const dom = new JSDOM("", { url: "https://recovery.invalid" });
  let tail = Promise.resolve<unknown>(null);
  Object.defineProperty(dom.window.navigator, "locks", { value: { request: (_name: string, run: () => unknown) => {
    const next = tail.then(run); tail = next.catch(() => null); return next;
  } } });
  Object.assign(globalThis, { window: dom.window });
  const input = { brandSlug: "fixture", raw: "- Amber\n- Birch", lineNumbers: [2], requestId: crypto.randomUUID() };
  return { dom, input };
}

test("simultaneous new confirmations reconcile; retries preserve exact content; completion erases menu", async () => {
  const { dom, input } = fixture();
  try {
    const [one, two] = await Promise.all([prepareImport("fixture", null, input), prepareImport("fixture", null, { ...input, requestId: crypto.randomUUID(), raw: "- Other", lineNumbers: [1] })]);
    assert.equal(one.ready, true); assert.equal(two.ready, false);
    assert.equal(one.entry?.id, two.entry?.id);
    assert.equal(one.entry?.phase, "pending");
    if (one.entry?.phase !== "pending") throw new Error("Missing pending fixture");
    assert.deepEqual(recoveryRequest(one.entry), input);
    const retry = await prepareImport("fixture", one.entry, { ...input, requestId: crypto.randomUUID() });
    assert.equal(retry.entry?.id, input.requestId);
    const complete = await confirmImport("fixture", input.requestId, 1);
    assert.equal(complete?.phase, "confirmed");
    assert.equal(dom.window.localStorage.getItem(recoveryKey("fixture"))!.includes("Amber"), false);
    assert.equal((await prepareImport("fixture", one.entry, input)).ready, false, "an old tab cannot turn a completed retry into another import");
    assert.equal(await readImportRecovery("other-brand"), null);
  } finally { dom.window.close(); }
});

test("explicit discard fences delayed success and stale tabs from newer confirmations", async () => {
  const { dom, input } = fixture();
  try {
    const first = await prepareImport("fixture", null, input);
    const discarded = await discardImport("fixture", first.entry);
    const next = await prepareImport("fixture", discarded, { ...input, requestId: crypto.randomUUID() });
    assert.equal(next.ready, true);
    assert.equal((await confirmImport("fixture", input.requestId, 1))?.id, next.entry?.id);
    assert.equal((await discardImport("fixture", first.entry))?.id, next.entry?.id);
    assert.equal((await readImportRecovery("fixture"))?.phase, "pending");
  } finally { dom.window.close(); }
});

test("corrupt, oversized, cross-brand and invalid selection copies fail closed until explicit discard", async () => {
  const { dom, input } = fixture();
  try {
    const entry = { version: 1, phase: "pending", brandSlug: "fixture", id: input.requestId, raw: input.raw, lineNumbers: input.lineNumbers };
    for (const text of ["{bad", "x".repeat(320001), JSON.stringify({ ...entry, brandSlug: "another" }), JSON.stringify({ ...entry, lineNumbers: [999] }), JSON.stringify({ ...entry, lineNumbers: [2, 2] }), JSON.stringify({ ...entry, version: 2 })]) {
      dom.window.localStorage.setItem(recoveryKey("fixture"), text);
      await assert.rejects(readImportRecovery("fixture"));
      await assert.rejects(prepareImport("fixture", null, input));
      assert.equal(dom.window.localStorage.getItem(recoveryKey("fixture")), text);
      assert.equal((await discardImport("fixture", null, true))?.phase, "discarded");
    }
  } finally { dom.window.close(); }
});

test("failed writes and missing browser locks prevent confirmation preparation", async () => {
  const { dom, input } = fixture();
  try {
    const proto = dom.window.Storage.prototype, original = proto.setItem;
    proto.setItem = () => { throw new dom.window.DOMException("Full", "QuotaExceededError"); };
    await assert.rejects(prepareImport("fixture", null, input));
    assert.equal(await readImportRecovery("fixture"), null);
    proto.setItem = original;
    Object.defineProperty(dom.window, "navigator", { value: {} });
    await assert.rejects(prepareImport("fixture", null, input));
  } finally { dom.window.close(); }
});
