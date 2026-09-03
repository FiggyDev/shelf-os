import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  getShelfPresence,
  FRESH_DAYS,
  STALE_DAYS,
  type ListingHealth,
} from "@/lib/shelf-presence";

export const dynamic = "force-dynamic";

const HEALTH_STYLE: Record<ListingHealth, { dot: string; label: string }> = {
  fresh: { dot: "bg-emerald-400", label: "Current" },
  aging: { dot: "bg-amber-400", label: "Aging" },
  stale: { dot: "bg-rose-500", label: "Stale" },
  missing: { dot: "bg-zinc-600", label: "Not listed" },
};

function Stat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "good" | "warn" | "bad";
  hint?: string;
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-rose-400"
          : "text-zinc-100";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export default async function ShelfPresencePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!brand) notFound();

  // Expected price = the brand's own MSRP per product. Using the median
  // observed price as a stand-in until MSRP is a first-class field.
  const listings = await prisma.retailerListing.findMany({
    where: { product: { brandId: brand.id } },
    select: { productId: true, listedPrice: true },
  });
  const byProduct = new Map<string, number[]>();
  for (const l of listings) {
    if (l.listedPrice == null) continue;
    const arr = byProduct.get(l.productId) ?? [];
    arr.push(Number(l.listedPrice));
    byProduct.set(l.productId, arr);
  }
  const expected: Record<string, number> = {};
  for (const [pid, prices] of byProduct) {
    prices.sort((a, b) => a - b);
    expected[pid] = prices[Math.floor(prices.length / 2)];
  }

  const { rows, summary } = await getShelfPresence(brand.id, expected);
  const problems = rows.filter((r) => r.health !== "fresh");

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Shelf Presence</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Every store carrying you, every product they should have listed, and
          whether what they&rsquo;re showing is current. Anything older than{" "}
          {STALE_DAYS} days is flagged stale; under {FRESH_DAYS} days is
          current.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Retailers" value={summary.retailers} />
        <Stat label="Current" value={summary.fresh} tone="good" />
        <Stat label="Aging" value={summary.aging} tone="warn" />
        <Stat label="Stale" value={summary.stale} tone="bad" />
        <Stat
          label="Not listed"
          value={summary.missing}
          hint="Should be carried, no listing found"
        />
      </div>

      {summary.priceMismatches > 0 && (
        <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="text-sm font-medium text-amber-300">
            {summary.priceMismatches} price{" "}
            {summary.priceMismatches === 1 ? "mismatch" : "mismatches"}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            A store is listing a price that differs from your typical shelf
            price. Worth a call before a customer notices.
          </p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Needs attention ({problems.length})
        </h2>

        {problems.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-zinc-400">
            Every listing is current. Nothing to chase.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-left text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Retailer</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 text-right font-semibold">Listed</th>
                  <th className="px-4 py-3 text-right font-semibold">Δ</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Last seen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {problems.map((r) => {
                  const style = HEALTH_STYLE[r.health];
                  return (
                    <tr
                      key={`${r.retailerId}:${r.productId}`}
                      className="transition hover:bg-white/[0.02]"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${style.dot}`}
                          />
                          <span className="text-zinc-300">{style.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-zinc-200">{r.retailerName}</div>
                        {r.city && (
                          <div className="text-xs text-zinc-500">
                            {r.city}
                            {r.stateCode ? `, ${r.stateCode}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {r.productName}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                        {r.listedPrice != null
                          ? `$${r.listedPrice.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.priceDelta != null && Math.abs(r.priceDelta) >= 0.01 ? (
                          <span
                            className={
                              r.priceDelta > 0
                                ? "text-amber-400"
                                : "text-sky-400"
                            }
                          >
                            {r.priceDelta > 0 ? "+" : ""}
                            {r.priceDelta.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {r.daysSinceObserved === null
                          ? "never"
                          : r.daysSinceObserved === 0
                            ? "today"
                            : `${r.daysSinceObserved}d ago`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
