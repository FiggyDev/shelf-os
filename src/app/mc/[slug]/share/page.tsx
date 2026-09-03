import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Share & QR.
 *
 * Every link carries a ?ref code so print, packaging, and in-store
 * placement can be told apart in analytics. That matters more here than
 * in most categories: with paid ads unavailable, physical placement IS
 * the acquisition channel, and without ref codes there's no way to know
 * which sticker or shelf-talker actually worked.
 *
 * QR codes are rendered server-side as SVG — sharp at any print size,
 * no client-side library shipped to visitors.
 */

const PLACEMENTS = [
  {
    ref: "pkg",
    label: "Packaging",
    hint: "Sticker or printed panel on the product itself",
  },
  {
    ref: "shelf",
    label: "Shelf talker",
    hint: "Card at the point of purchase in a dispensary",
  },
  {
    ref: "card",
    label: "Business card",
    hint: "Handed out at events and rep visits",
  },
  {
    ref: "bag",
    label: "Bag insert",
    hint: "Dropped in with the order at checkout",
  },
];

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true, name: true, brandColor: true },
  });
  if (!brand) notFound();

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const menuUrl = `${base}/b/${slug}`;

  const codes = await Promise.all(
    PLACEMENTS.map(async (p) => ({
      ...p,
      url: `${menuUrl}?ref=${p.ref}`,
      svg: await QRCode.toString(`${menuUrl}?ref=${p.ref}`, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        color: { dark: "#000000", light: "#FFFFFF" },
      }),
    })),
  );

  // Scans recorded so far, grouped by where the code was placed.
  const scans = await prisma.menuEvent.groupBy({
    by: ["refCode"],
    where: { brandId: brand.id, eventType: "menu_view" },
    _count: { _all: true },
  });
  const scanBy = new Map(
    scans.map((s) => [s.refCode ?? "direct", s._count._all]),
  );

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Share &amp; QR</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Codes for print and packaging. Each one tags its own link, so you
          can tell which placement actually brought people to the menu.
        </p>
      </header>

      <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Public menu
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-black/40 px-3 py-2 font-mono text-sm text-zinc-200">
            {menuUrl}
          </code>
          <span className="text-xs text-zinc-500">
            Set NEXT_PUBLIC_SITE_URL before printing anything
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {codes.map((c) => (
          <div
            key={c.ref}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-start gap-5">
              {/* White plate: QR needs light quiet-zone contrast to scan. */}
              <div
                className="h-32 w-32 shrink-0 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
              <div className="min-w-0">
                <h3 className="font-medium text-zinc-100">{c.label}</h3>
                <p className="mt-1 text-xs text-zinc-500">{c.hint}</p>
                <code className="mt-3 block truncate rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-zinc-400">
                  ?ref={c.ref}
                </code>
                <div className="mt-3 text-sm">
                  <span className="tabular-nums text-zinc-200">
                    {scanBy.get(c.ref) ?? 0}
                  </span>{" "}
                  <span className="text-xs text-zinc-500">
                    scan{(scanBy.get(c.ref) ?? 0) === 1 ? "" : "s"} recorded
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-500">
        <strong className="text-zinc-400">Printing notes.</strong> These are
        SVG, so they stay sharp at any size — don&rsquo;t screenshot them.
        Keep the white border: scanners need the quiet zone. Print at 2cm or
        larger for packaging, 5cm or larger for shelf cards. Test a scan from
        the final printed piece, not from the screen.
      </div>
    </div>
  );
}
