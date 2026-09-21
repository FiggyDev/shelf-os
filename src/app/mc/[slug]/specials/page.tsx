import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Specials.
 *
 * Promotions carry their own state scope because discounting rules are
 * not uniform: several cannabis markets restrict or ban price promotion
 * outright, and a special that's fine in one state can be a violation one
 * border over. Scoping is therefore part of the record, not an
 * afterthought — and a special with no states listed is flagged rather
 * than silently treated as global.
 */

function formatDiscount(type: string, value: unknown) {
  const n = Number(value);
  if (type === "PERCENT") return `${n % 1 === 0 ? n.toFixed(0) : n}% off`;
  if (type === "FIXED") return `$${n.toFixed(2)} off`;
  return "Buy one get one";
}

function windowLabel(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt && !endsAt) return "No end date";
  const s = startsAt ? startsAt.toLocaleDateString() : "now";
  const e = endsAt ? endsAt.toLocaleDateString() : "open-ended";
  return `${s} → ${e}`;
}

export default async function SpecialsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!brand) notFound();

  const specials = await prisma.special.findMany({
    where: { brandId: brand.id },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  // One request-time snapshot keeps counts and row badges consistent.
  // This force-dynamic Server Component evaluates expiry for each request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const active = specials.filter((s) => s.active);
  const expired = specials.filter(
    (s) => s.endsAt && s.endsAt.getTime() < now,
  );

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Specials</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Promotions and codes. Each one is scoped to the states it&rsquo;s
          allowed to run in.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300">
          {active.length} active
        </span>
        <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-400">
          {specials.length - active.length} inactive
        </span>
        {expired.length > 0 && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-300">
            {expired.length} past end date
          </span>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="text-sm text-amber-200/90">
          <strong className="font-semibold">Check before you run it.</strong>{" "}
          Several markets restrict or prohibit cannabis price promotion.
          A special that&rsquo;s fine in one state can be a violation across
          a border, which is why every one here carries its own state scope.
        </p>
      </div>

      <div className="space-y-3">
        {specials.map((s) => {
          const isExpired = s.endsAt && s.endsAt.getTime() < now;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    s.active
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/5 text-zinc-500"
                  }`}
                >
                  {s.active ? "Live" : "Paused"}
                </span>
                {isExpired && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                    Past end date
                  </span>
                )}
                {s.code && (
                  <code className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                    {s.code}
                  </code>
                )}
                <span className="ml-auto text-sm font-medium text-zinc-200">
                  {formatDiscount(s.discountType, s.discountValue)}
                </span>
              </div>

              <h3 className="mt-3 font-medium text-zinc-100">{s.name}</h3>
              {s.description && (
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {s.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                <span>{windowLabel(s.startsAt, s.endsAt)}</span>
                <span className="flex items-center gap-1.5">
                  Valid in:
                  {s.stateCodes.length ? (
                    s.stateCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                      >
                        {code}
                      </span>
                    ))
                  ) : (
                    <span className="text-amber-400">
                      no states set — scope this before going live
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
