"use client";

import { useActionState, useState } from "react";
import { updateProduct, type ActionResult } from "./actions";

export interface EditableProduct {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  published: boolean;
  importNotes: string | null;
  variants: {
    id: string;
    size: string;
    thc: string | null;
    potencyUnit: string;
    coaUrl: string | null;
    batchCode: string | null;
  }[];
}

export function ProductEditor({
  product,
  brandSlug,
}: {
  product: EditableProduct;
  brandSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateProduct,
    null,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            product.published ? "bg-emerald-400" : "bg-zinc-600"
          }`}
          title={product.published ? "Live on menu" : "Hidden"}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-100">
            {product.name}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            {product.category ?? "Uncategorised"} · {product.variants.length}{" "}
            variant{product.variants.length === 1 ? "" : "s"}
          </span>
        </span>
        {state?.ok && !open && (
          <span className="text-xs text-emerald-400">Saved</span>
        )}
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <form action={formAction} className="border-t border-white/10 p-5">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="brandSlug" value={brandSlug} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name">
              <input
                name="name"
                defaultValue={product.name}
                required
                maxLength={120}
                className="input"
              />
            </Field>
            <Field label="Category">
              <input
                name="category"
                defaultValue={product.category ?? ""}
                maxLength={60}
                placeholder="Flower, Edibles…"
                className="input"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Description">
              <textarea
                name="description"
                defaultValue={product.description ?? ""}
                rows={3}
                maxLength={2000}
                className="input resize-y"
              />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              name="published"
              defaultChecked={product.published}
              className="h-4 w-4 accent-emerald-400"
            />
            Show on the public menu
          </label>

          {product.importNotes && <details className="mt-4 rounded border border-white/10 p-3 text-sm text-zinc-400">
            <summary>Imported source — verify before publishing</summary>
            <p className="mt-2 whitespace-pre-wrap">{product.importNotes}</p>
          </details>}

          {/* Variants are read-only here — potency and COAs are batch-level
              records, edited where the batch lives, not inline. */}
          {product.variants.length > 0 && (
            <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                Variants
              </div>
              <ul className="space-y-1.5 text-sm">
                {product.variants.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-zinc-400"
                  >
                    <span className="font-medium text-zinc-200">{v.size}</span>
                    <span className="flex items-center gap-3">
                      {v.thc && (
                        <span>
                          THC {v.thc}
                          {v.potencyUnit === "PERCENT" ? "%" : "mg"}
                        </span>
                      )}
                      {v.batchCode && (
                        <span className="font-mono text-xs text-zinc-500">
                          {v.batchCode}
                        </span>
                      )}
                      {v.coaUrl ? (
                        <span className="text-emerald-400">COA ✓</span>
                      ) : (
                        <span className="text-amber-400">No COA</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            {state && !state.ok && (
              <span className="text-sm text-rose-400">{state.error}</span>
            )}
            {state?.ok && (
              <span className="text-sm text-emerald-400">
                Saved and logged to the audit trail
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
