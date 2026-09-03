/**
 * Chat menu parser.
 *
 * Brands in restricted categories often keep inventory as a text blob
 * pasted into a chat app — emoji headers, inconsistent bullets, prices
 * written five different ways, sold-out marked by whatever the person
 * felt like typing that day. This turns that into structured rows.
 *
 * It is deliberately forgiving and deliberately NOT clever: every parsed
 * row keeps the raw line it came from and a confidence score, because the
 * import flow is preview-then-confirm. A wrong guess an operator can see
 * and fix is fine. A wrong guess silently written to the catalog is not.
 */

export type ParsedStrainType = "INDICA" | "SATIVA" | "HYBRID" | null;

export interface ParsedPrice {
  /** Numeric amount in dollars. */
  amount: number;
  /** "8th", "quarter", "oz", "each", "gram" — null when unlabelled. */
  unit: string | null;
  raw: string;
}

export interface ParsedProduct {
  name: string;
  category: string | null;
  /** Tier heading the product sat under, e.g. "TIER 1", "EXOTIC". */
  tier: string | null;
  strainType: ParsedStrainType;
  prices: ParsedPrice[];
  soldOut: boolean;
  lowStock: boolean;
  /** The original line, kept so the operator can check our work. */
  rawLine: string;
  lineNumber: number;
  /** 0–1. Below ~0.5 should be shown as "needs review" in the UI. */
  confidence: number;
}

export interface ParseResult {
  products: ParsedProduct[];
  categories: string[];
  /** Lines we could not classify — surfaced so nothing vanishes silently. */
  skipped: { lineNumber: number; text: string; reason: string }[];
}

// Category words seen in real menus. Matching is substring + case-insensitive.
const CATEGORY_HINTS = [
  "flower",
  "bud",
  "concentrate",
  "wax",
  "shatter",
  "rosin",
  "resin",
  "badder",
  "batter",
  "diamond",
  "sauce",
  "hash",
  "edible",
  "gummy",
  "gummies",
  "chocolate",
  "cart",
  "cartridge",
  "vape",
  "disposable",
  "dispo",
  "preroll",
  "pre-roll",
  "joint",
  "blunt",
  "moonrock",
  "tincture",
  "topical",
  "extra",
  "misc",
  "accessor",
  "merch",
];

const SOLD_OUT_PATTERNS = [
  /\bsold\s*out\b/i,
  /\bs\/?o\b/i,
  /\bout\s*of\s*stock\b/i,
  /\boos\b/i,
  /\bgone\b/i,
  /\bunavailable\b/i,
  /❌|🚫|⛔/u,
];

const LOW_STOCK_PATTERNS = [
  /\blow\b/i,
  /\blast\s+(one|few|couple)\b/i,
  /\balmost\s+gone\b/i,
  /\brunning\s+low\b/i,
  /⚠️|🔻/u,
];

const UNIT_ALIASES: Record<string, string> = {
  g: "gram",
  gram: "gram",
  grams: "gram",
  "1g": "gram",
  eighth: "8th",
  "8th": "8th",
  "8thn": "8th",
  "8ths": "8th",
  "1/8": "8th",
  q: "quarter",
  quarter: "quarter",
  qp: "quarter pound",
  "1/4": "quarter",
  half: "half",
  "1/2": "half",
  hp: "half pound",
  oz: "oz",
  ounce: "oz",
  z: "oz",
  lb: "pound",
  pound: "pound",
  ea: "each",
  each: "each",
  pc: "each",
  piece: "each",
};

/** Strip decorative emoji and box-drawing so headers compare cleanly. */
function clean(line: string): string {
  return line
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu,
      " ",
    )
    .replace(/[=_~*·•▪◾◼■□★☆✦✧]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-–—+>»]|\d+[.)])\s*/, "").trim();
}

function detectStrainType(text: string): ParsedStrainType {
  if (/\b(indica|ind)\b/i.test(text) || /\(\s*i\s*\)|\[\s*i\s*\]/i.test(text))
    return "INDICA";
  if (/\b(sativa|sat)\b/i.test(text) || /\(\s*s\s*\)|\[\s*s\s*\]/i.test(text))
    return "SATIVA";
  if (/\b(hybrid|hyb)\b/i.test(text) || /\(\s*h\s*\)|\[\s*h\s*\]/i.test(text))
    return "HYBRID";
  return null;
}

/**
 * Pulls prices out of a line. Handles "$40", "40/8th", "$75 quarter",
 * "2 for $70". Bare numbers are only treated as prices when a currency
 * symbol appears somewhere on the line, so "Gelato 41" doesn't become $41.
 */
function extractPrices(line: string): ParsedPrice[] {
  const out: ParsedPrice[] = [];

  // A number only counts as money if a "$" is attached to it, or it is
  // followed by a recognised price unit ("40/8th"). Bare integers are
  // never prices — otherwise "Gelato 41" and "TIER 1" become dollars.
  const re =
    /(\$)\s?(\d{1,4}(?:\.\d{1,2})?)\s*(?:\/|\s+per\s+|\s+)?((?=[a-z0-9/]*[a-z])[a-z0-9/]{1,12})?|(\d{1,4}(?:\.\d{1,2})?)\s*\/\s*((?=[a-z0-9/]*[a-z])[a-z0-9/]{1,12})/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const hadDollar = Boolean(m[1]);
    const amount = Number(m[2] ?? m[4]);
    let rawUnit = (m[3] ?? m[5] ?? "").toLowerCase().replace(/[^a-z0-9/]/g, "");

    if (!Number.isFinite(amount) || amount <= 0 || amount > 20000) continue;

    // Potency, not price.
    if (/^(mg|mcg|thc|cbd|thca|cbg|percent)/.test(rawUnit)) continue;
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (/^\s*%/.test(after)) continue;

    const unit = UNIT_ALIASES[rawUnit] ?? null;
    // A bare "$40 Blue" shouldn't capture "Blue" as a unit.
    if (!unit && rawUnit && hadDollar) rawUnit = "";

    if (!hadDollar && !unit) continue;

    out.push({
      amount,
      unit,
      raw: (m[1] ?? "") + (m[2] ?? m[4]) + (unit ? (m[0].includes("/") ? "/" + rawUnit : " " + rawUnit) : ""),
    });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const k = `${x.amount}:${x.unit ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function matchCategory(text: string): string | null {
  // A line with money in it is a product line, not a section heading.
  if (/\$/.test(text)) return null;
  const lower = text.toLowerCase();
  for (const hint of CATEGORY_HINTS) {
    if (lower.includes(hint)) {
      return text
        .replace(/[:\-–—]+$/, "")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

/**
 * A header is a short line that names a category or tier and doesn't look
 * like a product. Tier headers usually carry the price ladder for the
 * products beneath them.
 */
function looksLikeHeader(raw: string, cleaned: string): boolean {
  if (!cleaned) return false;
  if (cleaned.length > 60) return false;
  if (/^\s*[-–—+>»]/.test(raw)) return false; // bulleted = product

  const letters = cleaned.replace(/[^a-z]/gi, "");
  const isShouty =
    letters.length > 2 && letters === letters.toUpperCase() && letters.length < 40;

  return (
    isShouty ||
    /\btier\b|\bshelf\b|\bmenu\b|\bsection\b/i.test(cleaned) ||
    (matchCategory(cleaned) !== null && cleaned.split(/\s+/).length <= 5)
  );
}

export function parseChatMenu(input: string): ParseResult {
  const lines = input.split(/\r?\n/);
  const products: ParsedProduct[] = [];
  const skipped: ParseResult["skipped"] = [];
  const categories: string[] = [];

  let currentCategory: string | null = null;
  let currentTier: string | null = null;
  let tierPrices: ParsedPrice[] = [];

  lines.forEach((raw, i) => {
    const lineNumber = i + 1;
    const cleaned = clean(raw);

    if (!cleaned) return;

    // Header?
    if (looksLikeHeader(raw, cleaned)) {
      const prices = extractPrices(cleaned);
      const category = matchCategory(cleaned);

      if (category && !/\btier\b/i.test(cleaned)) {
        currentCategory = category;
        currentTier = null;
        tierPrices = prices;
        if (!categories.includes(category)) categories.push(category);
      } else {
        // Tier heading — carries the price ladder for what follows.
        currentTier = cleaned
          .replace(/\$.*/, "")
          .replace(/[\s:\-–—]+$/, "")
          .trim();
        tierPrices = prices;
      }
      return;
    }

    // Product line.
    const withoutBullet = stripBullet(cleaned);
    if (!withoutBullet || withoutBullet.length < 2) {
      skipped.push({ lineNumber, text: raw.trim(), reason: "too short" });
      return;
    }

    const soldOut = SOLD_OUT_PATTERNS.some((p) => p.test(cleaned));
    const lowStock =
      !soldOut && LOW_STOCK_PATTERNS.some((p) => p.test(cleaned));
    const strainType = detectStrainType(cleaned);
    const ownPrices = extractPrices(cleaned);

    // Name = the line with prices, status markers and type tags removed.
    let name = withoutBullet;
    for (const p of ownPrices) name = name.replace(p.raw, " ");
    name = name
      .replace(/\(\s*[ish]\s*\)|\[\s*[ish]\s*\]/gi, " ")
      .replace(/\b(indica|sativa|hybrid|ind|sat|hyb)\b/gi, " ")
      .replace(
        /\bsold\s*out\b|\bs\/?o\b|\bout of stock\b|\boos\b|\bgone\b|\bunavailable\b|\blow\b|\blast (one|few|couple)\b/gi,
        " ",
      )
      .replace(/[.,;:|]+\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!name || name.length < 2) {
      skipped.push({
        lineNumber,
        text: raw.trim(),
        reason: "no product name left after cleaning",
      });
      return;
    }

    // Confidence: start neutral, reward signal, punish oddity.
    let confidence = 0.5;
    if (currentCategory) confidence += 0.15;
    if (ownPrices.length || tierPrices.length) confidence += 0.15;
    if (strainType) confidence += 0.1;
    if (name.split(/\s+/).length <= 6) confidence += 0.1;
    if (name.length > 45) confidence -= 0.25;
    if (/https?:|@|\bcall\b|\btext\b|\bdm\b/i.test(name)) confidence -= 0.4;
    confidence = Math.max(0, Math.min(1, confidence));

    products.push({
      name,
      category: currentCategory,
      tier: currentTier,
      strainType,
      prices: ownPrices.length ? ownPrices : tierPrices,
      soldOut,
      lowStock,
      rawLine: raw.trim(),
      lineNumber,
      confidence: Number(confidence.toFixed(2)),
    });
  });

  return { products, categories, skipped };
}
