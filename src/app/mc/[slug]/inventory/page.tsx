import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductEditor, type EditableProduct } from "./product-editor";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
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

  const products = await prisma.product.findMany({
    where: { brandId: brand.id },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    include: {
      variants: {
        orderBy: { size: "asc" },
        include: {
          batches: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { labResults: { where: { isCurrent: true }, take: 1 } },
          },
        },
      },
    },
  });

  const editable: EditableProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    published: p.published,
    variants: p.variants.map((v) => {
      const batch = v.batches[0];
      return {
        id: v.id,
        size: v.size,
        thc: v.thc != null ? String(Number(v.thc)) : null,
        potencyUnit: v.potencyUnit,
        coaUrl: batch?.labResults[0]?.fileUrl ?? null,
        batchCode: batch?.batchCode ?? null,
      };
    }),
  }));

  const live = editable.filter((p) => p.published).length;
  const missingCoa = editable.filter((p) =>
    p.variants.some((v) => !v.coaUrl),
  ).length;

  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Edit products and control what shows on the public menu. Every
          change is written to the audit log with who made it and what
          changed.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-400">
          {editable.length} products
        </span>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300">
          {live} live
        </span>
        {editable.length - live > 0 && (
          <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-500">
            {editable.length - live} hidden
          </span>
        )}
        {missingCoa > 0 && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-300">
            {missingCoa} missing a COA
          </span>
        )}
      </div>

      <div className="space-y-3">
        {editable.map((p) => (
          <ProductEditor key={p.id} product={p} brandSlug={slug} />
        ))}
      </div>
    </div>
  );
}
