"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, tokenIsValid } from "@/lib/mc-auth";
import { MenuImportInput, persistMenuImport, type MenuImportRequest, type MenuImportResult } from "@/lib/menu-import";

export async function importMenu(input: MenuImportRequest): Promise<MenuImportResult> {
  if (!(await tokenIsValid((await cookies()).get(SESSION_COOKIE)?.value))) return { ok: false, error: "Sign in to import products." };
  const parsed = MenuImportInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose 1–200 product rows from a menu of at most 50,000 characters." };
  try {
    const result = await persistMenuImport(parsed.data);
    if (result.ok) {
      revalidatePath(`/mc/${parsed.data.brandSlug}/inventory`);
      revalidatePath(`/mc/${parsed.data.brandSlug}/log`);
    }
    return result;
  } catch {
    return { ok: false, error: "Import could not be confirmed. Retry this selection; retries will not duplicate saved drafts." };
  }
}
