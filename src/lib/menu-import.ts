import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseChatMenu } from "./chat-menu-parser";

export const MenuImportInput = z.object({
  brandSlug: z.string().min(1).max(120),
  raw: z.string().min(1).max(50000),
  lineNumbers: z.array(z.number().int().positive()).min(1).max(200),
  requestId: z.string().uuid(),
});
export type MenuImportRequest = z.infer<typeof MenuImportInput>;
export type MenuImportResult = { ok: true; count: number } | { ok: false; error: string };

/** Called only after action session verification. Reparse instead of trusting client rows. */
export async function persistMenuImport(input: MenuImportRequest): Promise<MenuImportResult> {
  const lines = [...new Set(input.lineNumbers)].sort((a, b) => a - b);
  const rows = parseChatMenu(input.raw).products.filter(row => lines.includes(row.lineNumber));
  if (rows.length !== lines.length || !rows.length) return { ok: false, error: "Selected rows no longer match the preview. Review the menu again." };
  if (rows.some(row => row.name.length > 120 || (row.category?.length ?? 0) > 60)) return { ok: false, error: "A selected name or category is too long. Edit the source and preview again." };
  const brand = await prisma.brand.findUnique({ where: { slug: input.brandSlug }, select: { id: true } });
  if (!brand) return { ok: false, error: "Brand not found." };
  const requestHash = createHash("sha256").update(JSON.stringify([input.raw, lines])).digest("hex");
  return prisma.$transaction(async tx => {
    // Serializes only retries of this confirmation, including simultaneous deliveries.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${brand.id + ":" + input.requestId}, 0))`;
    const previous = await tx.menuImport.findUnique({ where: { brandId_requestId: { brandId: brand.id, requestId: input.requestId } } });
    if (previous) return previous.requestHash === requestHash
      ? { ok: true, count: previous.productIds.length }
      : { ok: false, error: "This confirmation was already used for different content. Preview again." };
    const productIds: string[] = [];
    for (const row of rows) {
      const notes = [
        "Original chat menu row: " + row.rawLine,
        "Tier: " + (row.tier ?? "Not specified"),
        "Source prices (not verified): " + (row.prices.map(price => "$" + price.amount.toFixed(2) + (price.unit ? "/" + price.unit : "")).join(", ") || "Not specified"),
        "Source stock marker (not verified): " + (row.soldOut ? "Sold out" : row.lowStock ? "Low" : "Not specified"),
        "Parser confidence: " + row.confidence,
      ].join("\n");
      const units = [...new Set(row.prices.flatMap(price => price.unit ? [price.unit] : []))];
      const product = await tx.product.create({ data: {
        brandId: brand.id,
        slug: (row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "product") + "-" + randomUUID(),
        name: row.name, category: row.category, strainType: row.strainType,
        published: false, importNotes: notes,
        variants: { create: units.map(size => ({ size })) },
      }, select: { id: true } });
      productIds.push(product.id);
    }
    await tx.menuImport.create({ data: { brandId: brand.id, requestId: input.requestId, requestHash, productIds } });
    await tx.auditEvent.create({ data: {
      brandId: brand.id, actorId: null, action: "menu.imported", entityType: "MenuImport", entityId: input.requestId,
      summary: `Imported ${rows.length} hidden catalog drafts`,
      metadata: { authentication: "shared_password", productIds, selectedLines: lines },
    } });
    return { ok: true, count: productIds.length };
  }, { timeout: 20000 });
}
