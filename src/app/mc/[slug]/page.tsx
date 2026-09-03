import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getShelfPresence } from "@/lib/shelf-presence";

export const dynamic = "force-dynamic";

/**
 * Mission Control overview.
 *
 * Built around what is WRONG, not what exists. An operator opens this
 * between other jobs; the useful thing is a short list of what needs
 * attention today, not a wall of vanity counts.
 */
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true, name: true, brandColor: true, licenseNumber: true },
  });
  if (!brand) notFound();

  const [
    products,
    live,
    missingCoa,
    customers,
    smsReach,
    pendingAlerts,
    activeSpecials,
    recent,
    presence,
  ] = await Promise.all([
    prisma.product.count({ where: { brandId: brand.id } }),
    prisma.product.count({ where: { brandId: brand.id, published: true } }),
    prisma.product.count({
      where: {
        brandId: brand.id,
        variants: { some: { batches: { none: { labResults: { some: { isCurrent: true } } } } } },
      },
    }),
    prisma.customer.count({ where: { brandId: brand.id, revokedAt: null } }),
    prisma.customer.count({
      where: { brandId: brand.id, revokedAt: null, smsOptIn: true },
    }),
    prisma.alert.count({
      where: { brandId: brand.id, status: "PENDING_APPROVAL" },
    }),
    prisma.special.count({ where: { brandId: brand.id, active: true } }),
    prisma.auditEvent.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { actor: { select: { name: true } } },
    }),
    getShelfPresence(brand.id),
  ]);

  const accent = brand.brandColor ?? "#9DFF3C";

  // Only genuine problems land here. An empty list is a good day.
  const attention: { label: string; href: string; tone: "bad" | "warn" }[] = [];
  if (presence.summary.stale > 0)
    attention.push({
      label: `${presence.summary.stale} stale retailer listing${presence.summary.stale === 1 ? "" : "s"}`,
      href: `/mc/${slug}/shelf`,
      tone: "bad",
    });
  if (presence.summary.missing > 0)
    attention.push({
      label: `${presence.summary.missing} product${presence.summary.missing === 1 ? "" : "s"} not listed where they should be`,
      href: `/mc/${slug}/shelf`,
      tone: "bad",
    });
  if (missingCoa > 0)
    attention.push({
      label: `${missingCoa} product${missingCoa === 1 ? "" : "s"} without a current COA`,
      href: `/mc/${slug}/inventory`,
      tone: "bad",
    });
  if (pendingAlerts > 0)
    attention.push({
      label: `${pendingAlerts} alert${pendingAlerts === 1 ? "" : "s"} waiting on approval`,
      href: `/mc/${slug}/alerts`,
      tone: "warn",
    });
  if (presence.summary.priceMismatches > 0)
    attention.push({
      label: `${presence.summary.priceMismatches} price mismatch${presence.summary.priceMismatches === 1 ? "" : "es"} at retail`,
      href: `/mc/${slug}/shelf`,
      tone: "warn",
    });

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: accent }}>
          {brand.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Mission Control
          {brand.licenseNumber && (
            <> · <span className="font-mono">{brand.licenseNumber}</span></>
          )}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-sm text-emerald-200/90">
            Nothing needs chasing. Listings are current and every product has
            a COA.
          </div>
        ) : (
          <div className="space-y-2">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={`flex items-center gap-3 rounded-xl border p-4 text-sm transition hover:bg-white/[0.03] ${
                  a.tone === "bad"
                    ? "border-rose-500/25 bg-rose-500/5 text-rose-200"
                    : "border-amber-400/25 bg-amber-400/5 text-amber-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${a.tone === "bad" ? "bg-rose-500" : "bg-amber-400"}`}
                />
                {a.label}
                <span className="ml-auto text-zinc-500">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live products" value={`${live}/${products}`} href={`/mc/${slug}/inventory`} />
        <Stat label="Retailers" value={presence.summary.retailers} href={`/mc/${slug}/shelf`} />
        <Stat label="Opted-in customers" value={customers} hint={`${smsReach} reachable by SMS`} href={`/mc/${slug}/customers`} />
        <Stat label="Active specials" value={activeSpecials} href={`/mc/${slug}/specials`} />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing logged yet.</p>
        ) : (
          <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {recent.map((e) => (
              <div key={e.id} className="flex items-start gap-3 p-4 text-sm">
                <code className="shrink-0 rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] text-zinc-500">
                  {e.action}
                </code>
                <span className="min-w-0 flex-1 text-zinc-300">{e.summary}</span>
                <span className="shrink-0 text-xs text-zinc-600">
                  {e.actor?.name ?? "System"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Link>
  );
}
