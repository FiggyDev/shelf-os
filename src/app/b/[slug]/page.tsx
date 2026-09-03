import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgeGate } from "@/components/age-gate";

export const dynamic = "force-dynamic";

function formatPotency(
  value: unknown,
  unit: "PERCENT" | "MG" | "MG_PER_SERVING",
) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  const trimmed = n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
  if (unit === "PERCENT") return `${trimmed}%`;
  if (unit === "MG_PER_SERVING") return `${trimmed}mg ea`;
  return `${trimmed}mg`;
}

export default async function BrandMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const brand = await prisma.brand.findFirst({
    where: { slug, published: true },
    include: {
      products: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
        include: {
          variants: {
            orderBy: { size: "asc" },
            include: {
              batches: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: {
                  labResults: { where: { isCurrent: true }, take: 1 },
                },
              },
            },
          },
        },
      },
      retailers: {
        where: { active: true },
        include: { retailer: true },
      },
    },
  });

  if (!brand) notFound();

  const accent = brand.brandColor ?? "#111111";
  const categories = [
    ...new Set(brand.products.map((p) => p.category ?? "Other")),
  ];

  return (
    <AgeGate brandName={brand.name} minimumAge={brand.minimumAge}>
      <main className="min-h-screen bg-stone-50 text-stone-900">
        {/* Header */}
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <h1
              className="text-4xl font-semibold tracking-tight"
              style={{ color: accent }}
            >
              {brand.name}
            </h1>
            {brand.tagline && (
              <p className="mt-2 text-lg text-stone-600">{brand.tagline}</p>
            )}
            {brand.about && (
              <p className="mt-6 max-w-2xl leading-relaxed text-stone-700">
                {brand.about}
              </p>
            )}
          </div>
        </header>

        {/* Menu */}
        <div className="mx-auto max-w-5xl px-6 py-12">
          {categories.map((category) => (
            <section key={category} className="mb-14">
              <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-stone-500">
                {category}
              </h2>

              <div className="grid gap-5 sm:grid-cols-2">
                {brand.products
                  .filter((p) => (p.category ?? "Other") === category)
                  .map((product) => (
                    <article
                      key={product.id}
                      className="rounded-lg border border-stone-200 bg-white p-6"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="text-xl font-medium">{product.name}</h3>
                        {product.strainType &&
                          product.strainType !== "NOT_APPLICABLE" && (
                            <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-stone-600">
                              {product.strainType}
                            </span>
                          )}
                      </div>

                      {product.description && (
                        <p className="mt-3 text-sm leading-relaxed text-stone-600">
                          {product.description}
                        </p>
                      )}

                      <ul className="mt-5 space-y-2 border-t border-stone-100 pt-4">
                        {product.variants.map((variant) => {
                          const coa = variant.batches[0]?.labResults[0];
                          const thc = formatPotency(
                            variant.thc,
                            variant.potencyUnit,
                          );
                          return (
                            <li
                              key={variant.id}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="font-medium">{variant.size}</span>
                              <span className="flex items-center gap-3 text-stone-600">
                                {thc && <span>THC {thc}</span>}
                                {coa && (
                                  <a
                                    href={coa.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline underline-offset-2 hover:text-stone-900"
                                  >
                                    COA
                                  </a>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
              </div>
            </section>
          ))}

          {/* Where to buy — the conversion path, since we can't transact */}
          {brand.retailers.length > 0 && (
            <section className="border-t border-stone-200 pt-12">
              <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-stone-500">
                Where to buy
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {brand.retailers.map(({ retailer }) => (
                  <div
                    key={retailer.id}
                    className="rounded-lg border border-stone-200 bg-white p-5"
                  >
                    <h3 className="font-medium">{retailer.name}</h3>
                    <p className="mt-1 text-sm text-stone-600">
                      {retailer.address1}
                      <br />
                      {retailer.city}, {retailer.stateCode}
                    </p>
                    {retailer.menuUrl && (
                      <a
                        href={retailer.menuUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm underline underline-offset-2"
                      >
                        View their menu
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-relaxed text-stone-500">
            <p>
              For adults {brand.minimumAge} and over. This page displays product
              information only — no sales or orders are processed here.
            </p>
            <p className="mt-2">
              Keep out of reach of children and pets. Please consume
              responsibly.
            </p>
          </div>
        </footer>
      </main>
    </AgeGate>
  );
}
