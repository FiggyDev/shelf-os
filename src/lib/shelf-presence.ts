import { prisma } from "@/lib/db";

/**
 * Shelf presence — the "where are we actually listed, and is it right?"
 * report.
 *
 * A brand is carried by N retailers. Each retailer publishes its own menu,
 * which the brand does not control. Prices drift, photos go missing, COA
 * links rot, and products quietly stop being listed. Today brands find
 * this out by opening each store's menu by hand, or never.
 *
 * A listing is judged on two axes:
 *   FRESHNESS — how long since we last confirmed it (observedAt)
 *   CORRECTNESS — does the listed price match what the brand expects
 *
 * Thresholds are deliberately conservative. Menu data older than a couple
 * of weeks should not be presented to an operator as current.
 */

export const FRESH_DAYS = 7;
export const STALE_DAYS = 21;

export type ListingHealth = "fresh" | "aging" | "stale" | "missing";

export interface ListingRow {
  retailerId: string;
  retailerName: string;
  city: string | null;
  stateCode: string | null;
  productId: string;
  productName: string;
  listedPrice: number | null;
  expectedPrice: number | null;
  priceDelta: number | null;
  inStock: boolean | null;
  observedAt: Date | null;
  daysSinceObserved: number | null;
  health: ListingHealth;
  source: string | null;
}

export interface ShelfPresenceReport {
  rows: ListingRow[];
  summary: {
    retailers: number;
    productsCarried: number;
    fresh: number;
    aging: number;
    stale: number;
    missing: number;
    priceMismatches: number;
  };
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function classify(days: number | null): ListingHealth {
  if (days === null) return "missing";
  if (days <= FRESH_DAYS) return "fresh";
  if (days <= STALE_DAYS) return "aging";
  return "stale";
}

/**
 * Builds the report for one brand.
 *
 * Every retailer × published-product pair is evaluated, so a product that
 * a store *should* carry but has no listing for shows up as `missing`
 * rather than silently vanishing from the report. That absence is usually
 * the most actionable row on the page.
 */
export async function getShelfPresence(
  brandId: string,
  expectedPriceByProductId: Record<string, number> = {},
): Promise<ShelfPresenceReport> {
  const [carriers, products] = await Promise.all([
    prisma.brandRetailer.findMany({
      where: { brandId, active: true },
      include: { retailer: true },
      orderBy: { retailer: { name: "asc" } },
    }),
    prisma.product.findMany({
      where: { brandId, published: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const listings = await prisma.retailerListing.findMany({
    where: {
      retailerId: { in: carriers.map((c) => c.retailerId) },
      productId: { in: products.map((p) => p.id) },
    },
  });

  const byKey = new Map(
    listings.map((l) => [`${l.retailerId}:${l.productId}`, l]),
  );

  const now = new Date();
  const rows: ListingRow[] = [];

  for (const carrier of carriers) {
    for (const product of products) {
      const listing = byKey.get(`${carrier.retailerId}:${product.id}`);
      const observedAt = listing?.observedAt ?? null;
      const days = observedAt ? daysBetween(observedAt, now) : null;

      const listedPrice =
        listing?.listedPrice != null ? Number(listing.listedPrice) : null;
      const expectedPrice = expectedPriceByProductId[product.id] ?? null;
      const priceDelta =
        listedPrice != null && expectedPrice != null
          ? Number((listedPrice - expectedPrice).toFixed(2))
          : null;

      rows.push({
        retailerId: carrier.retailerId,
        retailerName: carrier.retailer.name,
        city: carrier.retailer.city,
        stateCode: carrier.retailer.stateCode,
        productId: product.id,
        productName: product.name,
        listedPrice,
        expectedPrice,
        priceDelta,
        inStock: listing?.inStock ?? null,
        observedAt,
        daysSinceObserved: days,
        health: listing ? classify(days) : "missing",
        source: listing?.source ?? null,
      });
    }
  }

  // Worst first — an operator opens this to find problems, not to browse.
  const order: Record<ListingHealth, number> = {
    missing: 0,
    stale: 1,
    aging: 2,
    fresh: 3,
  };
  rows.sort(
    (a, b) =>
      order[a.health] - order[b.health] ||
      (b.daysSinceObserved ?? 0) - (a.daysSinceObserved ?? 0),
  );

  return {
    rows,
    summary: {
      retailers: carriers.length,
      productsCarried: products.length,
      fresh: rows.filter((r) => r.health === "fresh").length,
      aging: rows.filter((r) => r.health === "aging").length,
      stale: rows.filter((r) => r.health === "stale").length,
      missing: rows.filter((r) => r.health === "missing").length,
      priceMismatches: rows.filter(
        (r) => r.priceDelta !== null && Math.abs(r.priceDelta) >= 0.01,
      ).length,
    },
  };
}
