import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProductEditor, type EditableProduct } from "../src/app/mc/[slug]/inventory/product-editor";

test("open editor retains baseline across refresh and validation errors, advances only on save", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://review.invalid" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  const product: EditableProduct = { id: "fixture", revision: "a".repeat(64), name: "Original", category: null, description: null, published: false, importNotes: null, variants: [] };
  const revisions: string[] = [];
  const save = async (_previous: unknown, form: FormData) => {
    revisions.push(String(form.get("revision")));
    return revisions.length === 1 ? { ok: true as const, revision: "c".repeat(64) } : { ok: false as const, error: "Fixture validation error" };
  };
  const render = async (p: EditableProduct) => act(async () => root.render(<ProductEditor product={p} brandSlug="fixture" updateAction={save} />));
  const revision = () => document.querySelector<HTMLInputElement>('input[name="revision"]')!.value;
  try {
    await render(product);
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
    await render({ ...product, revision: "b".repeat(64), name: "External edit" });
    assert.equal(revision(), "a".repeat(64));
    assert.equal(document.querySelector<HTMLInputElement>('input[name="name"]')!.value, "Original");
    await act(async () => document.querySelector<HTMLFormElement>("form")!.requestSubmit());
    assert.equal(revision(), "c".repeat(64));
    await act(async () => document.querySelector<HTMLFormElement>("form")!.requestSubmit());
    assert.equal(revision(), "c".repeat(64));
    assert.deepEqual(revisions, ["a".repeat(64), "c".repeat(64)]);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /validation error/);
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
    assert.equal(revision(), "b".repeat(64));
    assert.equal(document.querySelector<HTMLInputElement>('input[name="name"]')!.value, "External edit");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
