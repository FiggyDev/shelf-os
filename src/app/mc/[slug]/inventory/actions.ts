"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { inventoryRevision } from "@/lib/inventory-revision";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, tokenIsValid } from "@/lib/mc-auth";

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
  revision: z.string().regex(/^[a-f0-9]{64}$/, "Reload inventory before saving this form."),
  brandSlug: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.string().trim().max(60).nullable(),
  description: z.string().trim().max(2000).nullable(),
  published: z.boolean(),
});

export type ActionResult = { ok: true; revision?: string } | { ok: false; error: string; conflict?: boolean; revision?: string };

/** The pilot session grants shared access, never a particular staff identity. */
async function hasSession() {
  return tokenIsValid((await cookies()).get(SESSION_COOKIE)?.value);
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
  if (!(await hasSession())) return { ok: false, error: "Sign in to edit inventory." };
  const parsed = ProductUpdate.safeParse({
    productId: formData.get("productId"),
    revision: formData.get("revision"),
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

  const result = await prisma.$transaction<ActionResult>(async (tx) => {
    // Lock before reading: audits describe the state this write replaces.
    await tx.$queryRaw`
      SELECT p.id FROM "Product" p JOIN "Brand" b ON b.id = p."brandId"
      WHERE p.id = ${input.productId} AND b.slug = ${input.brandSlug}
      FOR UPDATE OF p
    `;
    const existing = await tx.product.findUnique({
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

    const revision = inventoryRevision(existing);
    // An identical retry is harmless, including after another editor saved it.
    if (changes.length === 0) return { ok: true, revision };
    if (input.revision !== revision) {
      return { ok: false, conflict: true, error: "This product changed since you opened it. Copy your edits, then reload inventory to review the latest version." };
    }

    await tx.product.update({
      where: { id: input.productId },
      data: {
        name: input.name,
        category: input.category,
        description: input.description,
        published: input.published,
      },
    });
    await tx.auditEvent.create({
      data: {
        brandId: existing.brand.id,
        actorId: null,
        action: "product.updated",
        entityType: "Product",
        entityId: input.productId,
        summary: `${existing.name}: ${changes.join(", ")}`,
        metadata: { changes, authentication: "shared_password" },
      },
    });
    return { ok: true, revision: inventoryRevision(input) };
  });
  if (!result.ok) return result;

  revalidatePath(`/mc/${input.brandSlug}/inventory`);
  revalidatePath(`/mc/${input.brandSlug}/log`);
  revalidatePath(`/b/${input.brandSlug}`);
  return result;
}

/** Fast path for the visibility switch — same audit guarantee. */
export async function toggleProductPublished(
  brandSlug: string,
  productId: string,
): Promise<ActionResult> {
  if (!(await hasSession())) return { ok: false, error: "Sign in to edit inventory." };
  const result = await prisma.$transaction<ActionResult>(async (tx) => {
    // Lock before reading: audits describe the state this write replaces.
    await tx.$queryRaw`
      SELECT p.id FROM "Product" p JOIN "Brand" b ON b.id = p."brandId"
      WHERE p.id = ${productId} AND b.slug = ${brandSlug}
      FOR UPDATE OF p
    `;
    const existing = await tx.product.findUnique({
      where: { id: productId },
      include: { brand: { select: { id: true, slug: true } } },
    });

    if (!existing) return { ok: false, error: "Product not found" };
    if (existing.brand.slug !== brandSlug) {
      return { ok: false, error: "Product does not belong to this brand" };
    }

    const next = !existing.published;
    await tx.product.update({
      where: { id: productId },
      data: { published: next },
    });
    await tx.auditEvent.create({
      data: {
        brandId: existing.brand.id,
        actorId: null,
        action: next ? "product.published" : "product.hidden",
        entityType: "Product",
        entityId: productId,
        summary: `${existing.name} ${next ? "shown on" : "hidden from"} the public menu`,
        metadata: { authentication: "shared_password" },
      },
    });
    return { ok: true };
  });
  if (!result.ok) return result;

  revalidatePath(`/mc/${brandSlug}/inventory`);
  revalidatePath(`/mc/${brandSlug}/log`);
  revalidatePath(`/b/${brandSlug}`);
  return { ok: true };
}
