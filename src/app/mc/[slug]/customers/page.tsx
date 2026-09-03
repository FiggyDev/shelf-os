import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Customer list.
 *
 * Consent is shown PER CHANNEL, not as a single "subscribed" flag,
 * because that's how it legally works: agreeing to email is not agreeing
 * to SMS. Under the TCPA, SMS marketing consent is separately meaningful
 * and penalties are assessed per message. Revoked contacts are retained
 * and clearly marked rather than deleted, so the record of consent — and
 * of its withdrawal — survives.
 */
export default async function CustomersPage({
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

  const customers = await prisma.customer.findMany({
    where: { brandId: brand.id },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  const active = customers.filter((c) => !c.revokedAt);
  const stats = {
    total: active.length,
    email: active.filter((c) => c.emailOptIn).length,
    sms: active.filter((c) => c.smsOptIn).length,
    push: active.filter((c) => c.pushOptIn).length,
    revoked: customers.length - active.length,
  };

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Everyone who opted in, and to what. Consent is tracked per
          channel — agreeing to email is not agreeing to texts.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Active" value={stats.total} />
        <Stat label="Email" value={stats.email} tone="sky" />
        <Stat label="SMS" value={stats.sms} tone="emerald" />
        <Stat label="Push" value={stats.push} tone="violet" />
        <Stat label="Opted out" value={stats.revoked} tone="muted" />
      </div>

      <div className="mb-6 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
        <p className="text-sm text-sky-200/90">
          <strong className="font-semibold">Before sending SMS:</strong> keep
          the consent record. Every row stores when consent was given, through
          which form, and from what IP. Opted-out contacts are kept, never
          deleted — the proof of consent has to outlive the subscription.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Channels</th>
              <th className="px-4 py-3 font-semibold">Tags</th>
              <th className="px-4 py-3 font-semibold">Consent</th>
              <th className="px-4 py-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {customers.map((c) => (
              <tr
                key={c.id}
                className={`transition hover:bg-white/[0.02] ${
                  c.revokedAt ? "opacity-40" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="text-zinc-200">{c.email ?? "—"}</div>
                  {c.phone && (
                    <div className="font-mono text-xs text-zinc-500">
                      {c.phone}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {c.emailOptIn && <Chip tone="sky">Email</Chip>}
                    {c.smsOptIn && <Chip tone="emerald">SMS</Chip>}
                    {c.pushOptIn && <Chip tone="violet">Push</Chip>}
                    {!c.emailOptIn && !c.smsOptIn && !c.pushOptIn && (
                      <span className="text-xs text-zinc-600">none</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {c.tags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {c.consentAt ? (
                    <>
                      <div>{c.consentAt.toLocaleDateString()}</div>
                      <div className="text-zinc-600">
                        {c.consentSource} · {c.consentIp}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.revokedAt ? (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-300">
                      Opted out
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                      Active
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  sky: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  muted: "border-white/10 bg-white/5 text-zinc-400",
};

function Chip({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  const color =
    tone === "sky"
      ? "text-sky-400"
      : tone === "emerald"
        ? "text-emerald-400"
        : tone === "violet"
          ? "text-violet-400"
          : tone === "muted"
            ? "text-zinc-500"
            : "text-zinc-100";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
