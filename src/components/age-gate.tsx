"use client";

import { useEffect, useState } from "react";

/**
 * Age verification gate.
 *
 * Most US adult-use cannabis markets require a site to confirm the visitor
 * is of legal age before showing product information. This is a
 * self-attestation gate — the common standard for informational brand
 * sites. It is NOT identity verification, which is a separate requirement
 * for transactions. We don't transact, so attestation is the right bar.
 *
 * The choice is stored per-browser only. Nothing is sent to the server and
 * no identifier is created, which keeps this out of scope for most privacy
 * disclosures.
 */
export function AgeGate({
  brandName,
  minimumAge,
  children,
}: {
  brandName: string;
  minimumAge: number;
  children: React.ReactNode;
}) {
  const storageKey = `age-ok:${brandName}`;
  // undefined = still reading storage; avoids flashing the gate to a
  // visitor who already confirmed.
  const [confirmed, setConfirmed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    try {
      setConfirmed(window.sessionStorage.getItem(storageKey) === "1");
    } catch {
      // Private mode or storage disabled — gate every time rather than fail open.
      setConfirmed(false);
    }
  }, [storageKey]);

  if (confirmed === undefined) {
    return <div className="min-h-screen bg-stone-50" aria-hidden />;
  }

  if (confirmed) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-900 px-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold text-stone-900">{brandName}</h1>
        <p className="mt-4 text-stone-600">
          You must be {minimumAge} or older to view this site.
        </p>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => {
              try {
                window.sessionStorage.setItem(storageKey, "1");
              } catch {
                /* storage unavailable — continue for this render only */
              }
              setConfirmed(true);
            }}
            className="flex-1 rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition hover:bg-stone-700"
          >
            I am {minimumAge} or older
          </button>
          <a
            href="https://www.google.com"
            className="flex-1 rounded-lg border border-stone-300 px-4 py-3 font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Exit
          </a>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-stone-400">
          Product information only. No sales are conducted on this site.
        </p>
      </div>
    </div>
  );
}
