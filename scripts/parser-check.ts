import { parseChatMenu } from "../src/lib/chat-menu-parser";

const sample = `
🔥🔥 VERIFIED CHAT MENU 🔥🔥

*** FLOWER ***
TIER 1 — $40/8th  $75/quarter
- Blue Dream (H)
- Gelato 41 (I) SOLD OUT
- Sour Diesel (S)

TIER 2 - $50 8th
• Runtz (H) LOW
• Zkittlez (I)

CONCENTRATES
- Live Rosin $60 each
- Shatter $35 ea ❌

EDIBLES 🍬
- Sunbreak Gummies 10mg $25
- Choco Bar $20

DISPOSABLES
Northern Lights dispo $45
Text me to order 555-0100
`;

const r = parseChatMenu(sample);
console.log("categories:", r.categories);
console.log("products:", r.products.length, "| skipped:", r.skipped.length);
console.log("");
for (const p of r.products) {
  const price = p.prices.map((x) => `$${x.amount}${x.unit ? "/" + x.unit : ""}`).join(" ");
  const flags = [p.soldOut && "SOLD OUT", p.lowStock && "LOW"].filter(Boolean).join(" ");
  console.log(
    `  ${(p.category ?? "-").padEnd(13)} ${(p.tier ?? "-").padEnd(8)} ${p.name.padEnd(20)} ${(p.strainType ?? "-").padEnd(7)} ${price.padEnd(18)} ${flags.padEnd(9)} conf ${p.confidence}`,
  );
}
if (r.skipped.length) { console.log("\nskipped:"); r.skipped.forEach(s => console.log(`  L${s.lineNumber}: ${s.text} (${s.reason})`)); }
