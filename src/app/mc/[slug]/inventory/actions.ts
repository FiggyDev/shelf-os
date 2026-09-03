"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Inventory mutations.
 *
 * Every write records an AuditEvent in the same transaction as the change
 * itself. If the audit write fails the change rolls back — an audit log
 * that can silently miss events is worse than no audit log, because it
 * looks trustworthy while lying.
 */

const ProductUpdate = z.object({
  productId: z.string().min(1),
  brandSlug: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.string().trim().max(60).nullable(),
  description: z.string().trim().max(2000).nullable(),
  published: z.boolean(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/** The staff member acting. Real auth replaces this; the shape doesn't change. */
async function currentActor(brandId: string) {
  return prisma.staffUser.findFirst({
    where: { brandId, active: true },
    orderBy: { role: "asc" },
    select: { id: true },
  });
}

function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (a === b) continue;
    if (typeof b === "boolean") {
      out.push(`${key} ${b ? "enabled" : "disabled"}`);
    } else {
      const from =
        a === null || a === "" ? "empty" : `"${String(a).slice(0, 40)}"`;
      const to =
        b === null || b === "" ? "empty" : `"${String(b).slice(0, 40)}"`;
      out.push(`${key} ${from} → ${to}`);
    }
  }
  return out;
}

export async function updateProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ProductUpdate.safeParse({
    productId: formData.get("productId"),
    brandSlug: formData.get("brandSlug"),
    name: formData.get("name"),
    category: (formData.get("category") as string) || null,
    description: (formData.get("description") as string) || null,
    published: formData.get("published") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const input = parsed.data;

  const existing = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { brand: { select: { id: true, slug: true } } },
  });

  if (!existing) return { ok: false, error: "Product not found" };
  // Tenant check — never trust a product id from the client on its own.
  if (existing.brand.slug !== input.brandSlug) {
    return { ok: false, error: "Product does not belong to this brand" };
  }

  const changes = describeChanges(
    {
      name: existing.name,
      category: existing.category,
      description: existing.description,
      published: existing.published,
    },
    {
      name: input.name,
      category: input.category,
      description: input.description,
      published: input.published,
    },
  );

  if (changes.length === 0) return { ok: true };

  const actor = await currentActor(existing.brand.id);

  await prisma.$transaction([
    prisma.product.update({
      where: { id: input.productId },
      data: {
        name: input.name,
        category: input.category,
        description: input.description,
        published: input.published,
      },
    }),
    prisma.auditEvent.create({
      data: {
        brandId: existing.brand.id,
        actorId: actor?.id ?? null,
        action: "product.updated",
        entityType: "Product",
        entityId: input.productId,
        summary: `${existing.name}: ${changes.join(", ")}`,
        metadata: { changes },
      },
    }),
  ]);

  revalidatePath(`/mc/${input.brandSlug}/inventory`);
  revalidatePath(`/mc/${input.brandSlug}/log`);
  revalidatePath(`/b/${input.brandSlug}`);
  return { ok: true };
}

/** Fast path for the visibility switch — same audit guarantee. */
export async function toggleProductPublished(
  brandSlug: string,
  productId: string,
): Promise<ActionResult> {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: { select: { id: true, slug: true } } },
  });

  if (!existing) return { ok: false, error: "Product not found" };
  if (existing.brand.slug !== brandSlug) {
    return { ok: false, error: "Product does not belong to this brand" };
  }

  const next = !existing.published;
  const actor = await currentActor(existing.brand.id);

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { published: next },
    }),
    prisma.auditEvent.create({
      data: {
        brandId: existing.brand.id,
        actorId: actor?.id ?? null,
        action: next ? "product.published" : "product.hidden",
        entityType: "Product",
        entityId: productId,
        summary: `${existing.name} ${next ? "shown on" : "hidden from"} the public menu`,
      },
    }),
  ]);

  revalidatePath(`/mc/${brandSlug}/inventory`);
  revalidatePath(`/mc/${brandSlug}/log`);
  revalidatePath(`/b/${brandSlug}`);
  return { ok: true };
}
