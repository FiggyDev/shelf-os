"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <input
        type="password"
        name="password"
        autoFocus
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        aria-invalid={state.error ? true : undefined}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#9DFF3C]/40"
      />

      {state.error && (
        <p role="alert" className="text-sm text-rose-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#9DFF3C] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#8ae82f] disabled:opacity-50"
      >
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
