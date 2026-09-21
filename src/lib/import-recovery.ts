import { z } from "zod";
import { parseChatMenu } from "./chat-menu-parser";
import type { MenuImportRequest } from "./menu-import";

const common = { version: z.literal(1), brandSlug: z.string().min(1).max(120), id: z.string().uuid() };
const schema = z.discriminatedUnion("phase", [
  z.object({ ...common, phase: z.literal("pending"), raw: z.string().min(1).max(50000), lineNumbers: z.array(z.number().int().positive()).min(1).max(200) }).strict(),
  z.object({ ...common, phase: z.literal("confirmed"), count: z.number().int().min(1).max(200) }).strict(),
  z.object({ ...common, phase: z.literal("discarded") }).strict(),
]);
export type ImportRecovery = z.infer<typeof schema>;
export type PendingImport = Extract<ImportRecovery, { phase: "pending" }>;
export const recoveryKey = (brand: string) => `shelf:import-recovery:v1:${encodeURIComponent(brand)}`;
const revision = (value: ImportRecovery | null) => value ? `${value.id}:${value.phase}` : null;

function decode(raw: string | null, brand: string): ImportRecovery | null {
  if (raw === null) return null;
  if (raw.length > 320000) throw new Error("Recovery copy is too large.");
  const value = schema.parse(JSON.parse(raw));
  if (value.brandSlug !== brand) throw new Error("Recovery copy belongs to another brand.");
  if (value.phase === "pending") {
    const rows = new Set(parseChatMenu(value.raw).products.map(row => row.lineNumber));
    if (new Set(value.lineNumbers).size !== value.lineNumbers.length || value.lineNumbers.some(line => !rows.has(line))) {
      throw new Error("Recovery selection is invalid.");
    }
  }
  return value;
}

async function locked<T>(brand: string, run: () => T): Promise<T> {
  if (!window.navigator.locks) throw new Error("Browser recovery requires site storage and browser locks.");
  return window.navigator.locks.request(recoveryKey(brand), run);
}
function read(brand: string) { return decode(window.localStorage.getItem(recoveryKey(brand)), brand); }
function write(brand: string, value: ImportRecovery) {
  const text = JSON.stringify(value);
  window.localStorage.setItem(recoveryKey(brand), text);
  if (window.localStorage.getItem(recoveryKey(brand)) !== text) throw new Error("Recovery copy could not be verified.");
  return value;
}
export const readImportRecovery = (brand: string) => locked(brand, () => read(brand));

/** Persist before dispatch. A stale tab must reconcile, never replace another confirmation. */
export function prepareImport(brand: string, expected: ImportRecovery | null, input: MenuImportRequest) {
  return locked(brand, () => {
    const current = read(brand);
    if (revision(current) !== revision(expected)) return { ready: false as const, entry: current };
    if (current?.phase === "pending") return { ready: true as const, entry: current };
    const entry = decode(JSON.stringify({ version: 1, phase: "pending", brandSlug: brand, id: input.requestId, raw: input.raw, lineNumbers: input.lineNumbers }), brand) as PendingImport;
    write(brand, entry);
    return { ready: true as const, entry };
  });
}

/** Replace the menu with a small receipt; retain a generation marker for older tabs. */
export function confirmImport(brand: string, id: string, count: number) {
  return locked(brand, () => {
    const current = read(brand);
    if (current?.phase !== "pending" || current.id !== id) return current;
    return write(brand, schema.parse({ version: 1, phase: "confirmed", brandSlug: brand, id, count }));
  });
}

/** Explicit discard never undoes a server import or lets an older response clear newer work. */
export function discardImport(brand: string, expected: ImportRecovery | null, allowCorrupt = false) {
  return locked(brand, () => {
    const raw = window.localStorage.getItem(recoveryKey(brand));
    let current: ImportRecovery | null;
    try { current = decode(raw, brand); }
    catch (error) { if (!allowCorrupt) throw error; current = expected; }
    if (revision(current) !== revision(expected)) return current;
    return write(brand, { version: 1, phase: "discarded", brandSlug: brand, id: crypto.randomUUID() });
  });
}

export function recoveryRequest(entry: PendingImport): MenuImportRequest {
  return { brandSlug: entry.brandSlug, raw: entry.raw, lineNumbers: entry.lineNumbers, requestId: entry.id };
}
