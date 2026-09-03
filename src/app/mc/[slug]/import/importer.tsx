"use client";

import { useMemo, useState } from "react";
import { parseChatMenu, type ParsedProduct } from "@/lib/chat-menu-parser";

const SAMPLE = `🔥🔥 VERIFIED CHAT MENU 🔥🔥

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
- Choco Bar $20`;

const REVIEW_THRESHOLD = 0.5;

export function ChatMenuImporter() {
  const [raw, setRaw] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const result = useMemo(
    () => (raw.trim() ? parseChatMenu(raw) : null),
    [raw],
  );

  const included = useMemo(
    () => result?.products.filter((p) => !excluded.has(p.lineNumber)) ?? [],
    [result, excluded],
  );

  const needsReview = included.filter((p) => p.confidence < REVIEW_THRESHOLD);

  function toggle(lineNumber: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <label
            htmlFor="raw-menu"
            className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500"
          >
            Paste your chat menu
          </label>
          <button
            type="button"
            onClick={() => {
              setRaw(SAMPLE);
              setExcluded(new Set());
            }}
            className="text-xs text-zinc-400 underline underline-offset-4 transition hover:text-zinc-100"
          >
            Load a sample
          </button>
        </div>

        <textarea
          id="raw-menu"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setExcluded(new Set());
          }}
          rows={12}
          spellCheck={false}
          placeholder="Paste the whole thing — emoji, bullets, sold-out marks and all."
          className="w-full resize-y rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-white/25"
        />
      </div>

      {result && (
        <>
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300">
              {included.length} product{included.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-400">
              {result.categories.length} categories
            </span>
            {needsReview.length > 0 && (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-300">
                {needsReview.length} need review
              </span>
            )}
            {excluded.size > 0 && (
              <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-500">
                {excluded.size} excluded
              </span>
            )}
          </div>

          {needsReview.length > 0 && (
            <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/90">
              Rows marked for review scored low confidence — usually a phone
              number, an instruction, or a note rather than a product. Uncheck
              anything that isn&rsquo;t a real product before importing.
            </p>
          )}

          {/* Preview */}
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-left text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th className="w-10 px-3 py-3" />
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Tier</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Pricing</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.products.map((p) => (
                  <Row
                    key={p.lineNumber}
                    product={p}
                    excluded={excluded.has(p.lineNumber)}
                    onToggle={() => toggle(p.lineNumber)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {result.skipped.length > 0 && (
            <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <summary className="cursor-pointer text-sm text-zinc-400">
                {result.skipped.length} line
                {result.skipped.length === 1 ? "" : "s"} not imported
              </summary>
              <ul className="mt-3 space-y-1 font-mono text-xs text-zinc-500">
                {result.skipped.map((s) => (
                  <li key={s.lineNumber}>
                    <span className="text-zinc-600">L{s.lineNumber}</span>{" "}
                    {s.text}{" "}
                    <span className="text-zinc-700">— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={included.length === 0}
              className="rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import {included.length} product
              {included.length === 1 ? "" : "s"}
            </button>
            <span className="text-xs text-zinc-500">
              Nothing is written until you confirm.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  product,
  excluded,
  onToggle,
}: {
  product: ParsedProduct;
  excluded: boolean;
  onToggle: () => void;
}) {
  const low = product.confidence < REVIEW_THRESHOLD;

  return (
    <tr
      className={`transition ${excluded ? "opacity-35" : "hover:bg-white/[0.02]"}`}
      title={product.rawLine}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={!excluded}
          onChange={onToggle}
          aria-label={`Include ${product.name}`}
          className="h-4 w-4 accent-emerald-400"
        />
      </td>
      <td className="px-3 py-3">
        <div className="text-zinc-100">{product.name}</div>
        {low && (
          <div className="mt-0.5 text-[11px] text-amber-400">
            low confidence · {product.confidence}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-zinc-400">{product.category ?? "—"}</td>
      <td className="px-3 py-3 text-zinc-400">{product.tier ?? "—"}</td>
      <td className="px-3 py-3">
        {product.strainType ? (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
            {product.strainType}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums text-zinc-300">
        {product.prices.length
          ? product.prices
              .map((p) => `$${p.amount}${p.unit ? `/${p.unit}` : ""}`)
              .join("  ")
          : "—"}
      </td>
      <td className="px-3 py-3">
        {product.soldOut ? (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-300">
            Sold out
          </span>
        ) : product.lowStock ? (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            Low
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
    </tr>
  );
}
