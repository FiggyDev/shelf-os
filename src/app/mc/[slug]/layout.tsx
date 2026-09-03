import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "", label: "Overview" },
  { href: "/shelf", label: "Shelf Presence" },
  { href: "/inventory", label: "Inventory" },
  { href: "/import", label: "Import Menu" },
  { href: "/alerts", label: "Alert Bay" },
  { href: "/customers", label: "Customers" },
  { href: "/specials", label: "Specials" },
  { href: "/share", label: "Share & QR" },
  { href: "/staff", label: "Staff" },
  { href: "/log", label: "Audit Log" },
  { href: "/branding", label: "Branding" },
];

export default async function MissionControlLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { name: true, slug: true, brandColor: true, licenseNumber: true },
  });
  if (!brand) notFound();

  const accent = brand.brandColor ?? "#7CFF4F";
  const base = `/mc/${brand.slug}`;

  return (
    <div className="min-h-screen bg-[#07070D] text-zinc-100">
      {/* Ambient field — keeps the space theme without costing legibility */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(70rem 40rem at 12% -10%, rgba(124,255,79,.10), transparent 60%)," +
            "radial-gradient(60rem 36rem at 88% 8%, rgba(190,80,255,.12), transparent 60%)",
        }}
        aria-hidden
      />

      <div className="relative flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-black/40 backdrop-blur lg:flex">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Mission Control
            </div>
            <div
              className="mt-1 truncate text-lg font-semibold"
              style={{ color: accent }}
            >
              {brand.name}
            </div>
            {brand.licenseNumber && (
              <div className="mt-1 font-mono text-[10px] text-zinc-500">
                {brand.licenseNumber}
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={`${base}${item.href}`}
                className="block rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-white/10 p-3">
            <Link
              href={`/b/${brand.slug}`}
              className="block rounded-lg border border-white/10 px-3 py-2 text-center text-xs text-zinc-400 transition hover:border-white/25 hover:text-zinc-100"
            >
              View public menu →
            </Link>

            <form action={logout}>
              <button
                type="submit"
                className="mt-2 w-full rounded-lg px-3 py-2 text-center text-xs text-zinc-600 transition hover:text-zinc-300"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
