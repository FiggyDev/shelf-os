import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Staff and roles.
 *
 * Roles are deliberately coarse. Fine-grained permission matrices look
 * impressive in a demo and get abandoned in practice, because nobody
 * maintains them. Four roles that map to how a small brand actually
 * operates will be kept accurate, and an accurate coarse model beats a
 * stale fine one.
 */

const ROLES = [
  {
    key: "OWNER",
    label: "Owner",
    tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    can: [
      "Everything a manager can do",
      "Add and remove staff",
      "Approve and send alerts",
      "Change branding and billing",
    ],
  },
  {
    key: "MANAGER",
    label: "Manager",
    tone: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    can: [
      "Edit inventory and pricing",
      "Import menus",
      "Build specials",
      "Draft alerts (approval still required)",
    ],
  },
  {
    key: "BUDTENDER",
    label: "Budtender",
    tone: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    can: [
      "View inventory",
      "Mark items sold out or back in stock",
      "Nothing that changes price or visibility rules",
    ],
  },
  {
    key: "VIEWER",
    label: "Viewer",
    tone: "border-white/10 bg-white/5 text-zinc-400",
    can: ["Read-only across Mission Control", "Useful for accountants and consultants"],
  },
];

export default async function StaffPage({
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

  const staff = await prisma.staffUser.findMany({
    where: { brandId: brand.id },
    orderBy: [{ active: "desc" }, { role: "asc" }],
  });

  const counts = await prisma.auditEvent.groupBy({
    by: ["actorId"],
    where: { brandId: brand.id },
    _count: { _all: true },
  });
  const activity = new Map(counts.map((c) => [c.actorId, c._count._all]));

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Who has access, and what they can change. Every action they take is
          attributed in the audit log.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          People
        </h2>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 text-right font-semibold">Changes made</th>
                <th className="px-4 py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {staff.map((s) => {
                const role = ROLES.find((r) => r.key === s.role);
                return (
                  <tr
                    key={s.id}
                    className={`transition hover:bg-white/[0.02] ${s.active ? "" : "opacity-40"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-zinc-200">{s.name ?? "—"}</div>
                      <div className="text-xs text-zinc-500">{s.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${role?.tone ?? ROLES[3].tone}`}
                      >
                        {role?.label ?? s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {activity.get(s.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-500">
                      {s.active ? "Active" : "Disabled"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          What each role can do
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div
              key={r.key}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${r.tone}`}
              >
                {r.label}
              </span>
              <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
                {r.can.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-zinc-600">·</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
