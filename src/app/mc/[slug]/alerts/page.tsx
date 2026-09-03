import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Alert Bay.
 *
 * Sending is gated on approval by design: an alert must pass through
 * PENDING_APPROVAL and APPROVED before it can be SENT. Nothing goes from
 * DRAFT straight out the door. In a category where a careless message is
 * both a compliance problem and an unsubscribe event, the extra click is
 * the feature.
 *
 * Reach is computed from live consent, per channel, so the number shown
 * is who could actually be contacted right now — not the size of the list.
 */

const CHANNEL_TONE: Record<string, string> = {
  EMAIL: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  SMS: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  PUSH: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "border-white/10 bg-white/5 text-zinc-400",
  PENDING_APPROVAL: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  APPROVED: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  SENT: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  CANCELLED: "border-white/10 bg-white/5 text-zinc-600",
};

export default async function AlertBayPage({
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

  const [alerts, segments, reach] = await Promise.all([
    prisma.alert.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
      include: { segment: true },
    }),
    prisma.alertSegment.findMany({ where: { brandId: brand.id } }),
    (async () => {
      const active = { brandId: brand.id, revokedAt: null };
      const [email, sms, push] = await Promise.all([
        prisma.customer.count({ where: { ...active, emailOptIn: true } }),
        prisma.customer.count({ where: { ...active, smsOptIn: true } }),
        prisma.customer.count({ where: { ...active, pushOptIn: true } }),
      ]);
      return { EMAIL: email, SMS: sms, PUSH: push } as Record<string, number>;
    })(),
  ]);

  const pending = alerts.filter((a) => a.status === "PENDING_APPROVAL");

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Alert Bay</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Drop alerts and restock notices. Nothing sends without approval,
          and reach is counted from live consent rather than list size.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Reach label="Email reach" value={reach.EMAIL} tone="sky" />
        <Reach label="SMS reach" value={reach.SMS} tone="emerald" />
        <Reach label="Push reach" value={reach.PUSH} tone="violet" />
      </div>

      {pending.length > 0 && (
        <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="text-sm font-medium text-amber-300">
            {pending.length} alert{pending.length === 1 ? "" : "s"} waiting on
            approval
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            An owner or manager has to sign off before anything is delivered.
          </p>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Segments
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {segments.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${CHANNEL_TONE[s.channel]}`}
              >
                {s.channel}
              </span>
              <div className="mt-2 text-sm text-zinc-200">{s.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                ~{reach[s.channel] ?? 0} reachable
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Alerts
        </h2>
        <div className="space-y-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CHANNEL_TONE[a.channel]}`}
                >
                  {a.channel}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_TONE[a.status]}`}
                >
                  {a.status.replace("_", " ")}
                </span>
                <span className="ml-auto text-xs text-zinc-500">
                  {a.sentAt
                    ? `Sent ${a.sentAt.toLocaleDateString()} · ${a.recipientCount ?? 0} recipients`
                    : a.segment?.name}
                </span>
              </div>

              <h3 className="mt-3 font-medium text-zinc-100">{a.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {a.body}
              </p>

              {a.status !== "SENT" && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/25"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={a.status !== "PENDING_APPROVAL"}
                    className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                    title={
                      a.status === "PENDING_APPROVAL"
                        ? "Approve for sending"
                        : "Submit for approval first"
                    }
                  >
                    Approve
                  </button>
                  {a.status === "DRAFT" && (
                    <span className="text-xs text-zinc-600">
                      Drafts can&rsquo;t be sent directly — submit for approval
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-500">
        <strong className="text-zinc-400">Sending rules.</strong> Quiet hours
        apply — nothing delivers overnight in the recipient&rsquo;s timezone.
        Opt-out is honoured immediately and permanently. SMS consent is
        separate from email consent and is never inferred from it.
      </div>
    </div>
  );
}

function Reach({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  const color =
    tone === "sky"
      ? "text-sky-400"
      : tone === "emerald"
        ? "text-emerald-400"
        : "text-violet-400";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">consented, not revoked</div>
    </div>
  );
}
