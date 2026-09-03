import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Tenant branding.
 *
 * Three art slots rather than one, because they do different jobs. The
 * mark and the overlay stay separate so the overlay can animate over a
 * stationary mark on the hero; the share image is the two flattened
 * together, since a link preview is a single static frame and can't
 * layer anything.
 */
export default async function BrandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      tagline: true,
      about: true,
      brandColor: true,
      logoUrl: true,
      overlayUrl: true,
      shareImageUrl: true,
      minimumAge: true,
      licenseNumber: true,
      vertical: true,
    },
  });
  if (!brand) notFound();

  const accent = brand.brandColor ?? "#9DFF3C";

  const slots = [
    {
      title: "Primary mark",
      url: brand.logoUrl,
      field: "logoUrl",
      use: "In-app header and the public hero. No mascot — it sits on its own layer.",
    },
    {
      title: "Floating overlay",
      url: brand.overlayUrl,
      field: "overlayUrl",
      use: "Drifts above the mark on the hero. Kept separate so it can move.",
    },
    {
      title: "Share image",
      url: brand.shareImageUrl,
      field: "shareImageUrl",
      use: "Link and social previews. Mark and mascot combined — a preview card can't layer.",
    },
  ];

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Branding</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          How this tenant looks on the public menu and in link previews.
        </p>
      </header>

      <section className="mb-10 grid gap-4 sm:grid-cols-3">
        {slots.map((s) => (
          <div
            key={s.field}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              {s.title}
            </div>

            {/* Checkerboard reveals transparency problems immediately. */}
            <div
              className="mt-3 flex h-40 items-center justify-center rounded-lg p-3"
              style={{
                backgroundImage:
                  "linear-gradient(45deg,#1a1a22 25%,transparent 25%),linear-gradient(-45deg,#1a1a22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1a22 75%),linear-gradient(-45deg,transparent 75%,#1a1a22 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                backgroundColor: "#101018",
              }}
            >
              {s.url ? (
                <div className="relative h-full w-full">
                  <Image
                    src={s.url}
                    alt={s.title}
                    fill
                    sizes="(max-width: 640px) 90vw, 320px"
                    className="object-contain"
                  />
                </div>
              ) : (
                <span className="text-xs text-zinc-600">Not set</span>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{s.use}</p>
            <code className="mt-2 block truncate font-mono text-[10px] text-zinc-600">
              {s.url ?? "—"}
            </code>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Identity
          </h2>
          <dl className="space-y-3 text-sm">
            <Row label="Name" value={brand.name} />
            <Row label="Tagline" value={brand.tagline ?? "—"} />
            <Row label="Menu URL" value={`/b/${brand.slug}`} mono />
            <Row label="Vertical" value={brand.vertical} />
            <Row label="Minimum age" value={String(brand.minimumAge)} />
            <Row
              label="Licence"
              value={brand.licenseNumber ?? "Not set"}
              mono
            />
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">Accent</dt>
              <dd className="flex items-center gap-2">
                <span
                  className="h-5 w-5 rounded border border-white/20"
                  style={{ background: accent }}
                />
                <code className="font-mono text-xs text-zinc-300">
                  {accent}
                </code>
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Asset guidance
          </h2>
          <ul className="space-y-2.5 text-sm leading-relaxed text-zinc-400">
            <li>
              Supply transparent PNGs. Artwork on a solid square shows a hard
              edge against the hero.
            </li>
            <li>
              Keep the mark and the overlay as separate files. Flattening them
              removes the motion.
            </li>
            <li>
              Share image should be square and at least 1200px — previews
              crop, and detail is lost at small sizes.
            </li>
            <li>
              Once a share image is live, leave it alone. Platforms cache
              previews aggressively and changing it looks broken for days.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd
        className={`truncate text-right text-zinc-200 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
