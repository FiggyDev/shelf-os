/**
 * Mission Control gate.
 *
 * A single shared password. This keeps the demo off the open internet;
 * it is NOT per-user authentication and deliberately does not pretend to
 * be. Inventory audit entries record shared-password authentication,
 * without inventing a StaffUser identity.
 * Before a real brand puts two people in here, this needs replacing with
 * per-user login against StaffUser.
 *
 * Runs in the proxy and actions, so it uses Web Crypto only — no
 * Node `crypto` import.
 */

const COOKIE = "mc_session";
const TTL_MS = 1000 * 60 * 60 * 12; // 12h — a working day, then re-enter

function secret(): string {
  const s = process.env.MC_SESSION_SECRET ?? process.env.MC_PASSWORD;
  if (!s) throw new Error("MC_PASSWORD is not set");
  return s;
}

/** Constant-time compare. Avoids leaking match length via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Password check. Constant-time so the gate can't be probed byte by byte. */
export function passwordMatches(input: string): boolean {
  const expected = process.env.MC_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}

export async function issueToken(): Promise<string> {
  const expires = Date.now() + TTL_MS;
  return `${expires}.${await sign(String(expires))}`;
}

/** Verifies expiry AND signature, so the expiry can't simply be edited. */
export async function tokenIsValid(token: string | undefined): Promise<boolean> {
  if (!process.env.MC_PASSWORD || !token || !/^\d+\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, sig] = token.split(".");
  if (!Number.isSafeInteger(Number(expires)) || Number(expires) <= Date.now()) return false;
  try {
    return safeEqual(sig, await sign(expires));
  } catch {
    // Missing or invalid signing configuration must not authorize an action.
    return false;
  }
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_TTL_MS = TTL_MS;
