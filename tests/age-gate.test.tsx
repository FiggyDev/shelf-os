import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { AgeGate } from "../src/components/age-gate";

const menu = (brandName = "Review Brand", minimumAge = 18) => (
  <AgeGate brandName={brandName} minimumAge={minimumAge}>
    <p>Private menu content</p>
  </AgeGate>
);

async function browser(run: (container: HTMLElement) => Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://review.invalid" });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try { await run(dom.window.document.getElementById("root")!); }
  finally {
    dom.window.close();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

const confirm = async (container: HTMLElement) => {
  const button = container.querySelector("button");
  assert.ok(button, "confirmation is required");
  await act(async () => button.click());
  assert.match(container.textContent!, /Private menu content/);
};

// These tests render the real component and exercise browser storage and hydration.
test("increasing the minimum age requires a fresh confirmation without remounting the caller", async () => {
  await browser(async (container) => {
    const root = createRoot(container);
    try {
      await act(async () => root.render(menu()));
      await confirm(container);
      await act(async () => root.render(menu("Review Brand", 21)));
      assert.doesNotMatch(container.textContent!, /Private menu content/);
      assert.match(container.textContent!, /I am 21 or older/);
    } finally { await act(async () => root.unmount()); }
  });
});

test("confirmation persists on remount but does not apply to another brand", async () => {
  await browser(async (container) => {
    let root = createRoot(container);
    try {
      await act(async () => root.render(menu()));
      await confirm(container);
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(menu()));
      assert.match(container.textContent!, /Private menu content/);
      await act(async () => root.render(menu("Other Brand")));
      assert.doesNotMatch(container.textContent!, /Private menu content/);
    } finally { await act(async () => root.unmount()); }
  });
});

test("legacy confirmation without a recorded minimum age cannot open the menu", async () => {
  await browser(async (container) => {
    window.sessionStorage.setItem("age-ok:Review Brand", "1");
    const root = createRoot(container);
    try {
      await act(async () => root.render(menu("Review Brand", 21)));
      assert.doesNotMatch(container.textContent!, /Private menu content/);
      await confirm(container);
    } finally { await act(async () => root.unmount()); }
  });
});

test("unavailable storage remains gated until confirmation and gates again on remount", async () => {
  await browser(async (container) => {
    Object.defineProperty(window, "sessionStorage", { get() { throw new Error("storage disabled"); } });
    let root = createRoot(container);
    try {
      await act(async () => root.render(menu()));
      assert.doesNotMatch(container.textContent!, /Private menu content/);
      await confirm(container);
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(menu()));
      assert.doesNotMatch(container.textContent!, /Private menu content/);
    } finally { await act(async () => root.unmount()); }
  });
});

test("server HTML stays closed and hydrates a returning visitor without mismatches", async () => {
  const html = renderToString(menu());
  assert.doesNotMatch(html, /Private menu content/);
  await browser(async (container) => {
    let root: Root = createRoot(container);
    try {
      await act(async () => root.render(menu()));
      await confirm(container);
      await act(async () => root.unmount());
      container.innerHTML = html;
      const errors: unknown[] = [];
      await act(async () => { root = hydrateRoot(container, menu(), { onRecoverableError: error => errors.push(error) }); });
      assert.deepEqual(errors, []);
      assert.match(container.textContent!, /Private menu content/);
    } finally { await act(async () => root.unmount()); }
  });
});
