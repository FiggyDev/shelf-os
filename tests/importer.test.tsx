import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChatMenuImporter } from "../src/app/mc/[slug]/import/importer";

test("confirmation sends selected rows, retains retry identity and reports saved drafts", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://review.invalid" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const calls: { raw: string; lineNumbers: number[]; requestId: string; brandSlug: string }[] = [];
  try {
    await act(async () => root.render(<ChatMenuImporter brandSlug="review-brand" importAction={async (input) => {
      calls.push(input);
      return calls.length === 1 ? { ok: false, error: "Temporary failure. Retry." } : { ok: true, count: input.lineNumbers.length };
    }} />));
    await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    assert.ok(checkboxes.length > 1);
    await act(async () => checkboxes[0].click());
    const confirm = () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.startsWith("Import "))!;
    await act(async () => confirm().click());
    assert.equal(calls.length, 1, "confirmation must invoke the persistence action");
    assert.equal(calls[0].lineNumbers.length, checkboxes.length - 1);
    assert.equal(calls[0].brandSlug, "review-brand");
    assert.match(container.textContent!, /Temporary failure/);
    await act(async () => confirm().click());
    assert.equal(calls.length, 2);
    assert.equal(calls[0].requestId, calls[1].requestId);
    assert.match(container.textContent!, /Saved.*draft/);
    assert.equal(confirm().disabled, true);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
