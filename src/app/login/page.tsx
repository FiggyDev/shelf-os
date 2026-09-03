import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07070D] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Mission Control
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">
            Shelf OS
          </h1>
        </div>

        {reason === "unconfigured" ? (
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5 text-sm leading-relaxed text-amber-200/90">
            <strong className="font-semibold">Gate not configured.</strong> Set{" "}
            <code className="font-mono text-xs">MC_PASSWORD</code> in your
            environment and restart. Access is refused until it is set.
          </div>
        ) : (
          <LoginForm next={next ?? ""} />
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-zinc-600">
          Shared access password. Not per-user sign-in — actions in the audit
          log are attributed by staff record, not by who signed in here.
        </p>
      </div>
    </main>
  );
}
