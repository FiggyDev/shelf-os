import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChatMenu } from "../src/lib/chat-menu-parser";

for (const [marker, soldOut, lowStock] of [
  ["❌", true, false],
  ["⚠️", false, true],
  ["🔻", false, true],
  ["almost gone", false, true],
  ["SOLD OUT ⚠️", true, false],
] as const) {
  test(`preserves stock meaning for ${marker}`, () => {
    const result = parseChatMenu(`FLOWER\n- Review Product $35 each ${marker}`);
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].soldOut, soldOut);
    assert.equal(result.products[0].lowStock, lowStock);
    assert.equal(result.products[0].name, "Review Product");
    assert.deepEqual(result.products[0].prices.map(({ amount, unit }) => ({ amount, unit })), [{ amount: 35, unit: "each" }]);
  });
}
