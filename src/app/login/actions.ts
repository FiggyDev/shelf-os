"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  issueToken,
  passwordMatches,
} from "@/lib/mc-auth";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!passwordMatches(password)) {
    // Fixed delay on failure. Not real rate limiting, but it makes a
    // brute-force attempt against the gate meaningfully slower.
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Incorrect password." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await issueToken(), {
    httpOnly: true, // not readable from JS, so XSS can't lift the session
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  // Only ever redirect inside Mission Control. Taking the raw `next`
  // value would turn this login into an open redirect.
  redirect(next.startsWith("/mc/") ? next : "/mc/high-state");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
