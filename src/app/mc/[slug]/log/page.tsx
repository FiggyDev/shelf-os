import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, string> = {
  OWNER: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  MANAGER: "text-sky-300 border-sky-400/30 bg-sky-400/10",
  BUDTENDER: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  VIEWER: "text-zinc-400 border-white/10 bg-white/5",
};

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function AuditLogPage({
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

  const events = await prisma.auditEvent.findMany({
    where: { brandId: brand.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true, role: true } } },
  });

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Append-only record of every change, who made it, and when. Entries
          cannot be edited or deleted — a log you can rewrite isn&rsquo;t a log.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-sm text-zinc-400">No activity recorded yet.</p>
          <p className="mt-2 text-xs text-zinc-600">
            Edit a product in Inventory and it will appear here immediately.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-white/10 pl-6">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.6rem] top-2 h-2 w-2 rounded-full bg-zinc-600" />
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                    {e.action}
                  </code>
                  {e.actor?.role && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        ROLE_TONE[e.actor.role] ?? ROLE_TONE.VIEWER
                      }`}
                    >
                      {e.actor.role}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-zinc-500">
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-200">{e.summary}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {e.actor?.name ?? e.actor?.email ?? "System"} ·{" "}
                  {e.createdAt.toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
