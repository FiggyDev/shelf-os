import { createHash } from "node:crypto";

/** Fingerprint only the fields this editor can replace, independent of timestamps. */
export function inventoryRevision(product: {
  name: string;
  category: string | null;
  description: string | null;
  published: boolean;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([product.name, product.category, product.description, product.published]))
    .digest("hex");
}
