import Image from "next/image";

/**
 * Public menu hero.
 *
 * The mark and the mascot are deliberately SEPARATE layers. The circular
 * mark stays put; the mascot drifts over it. Compositing them into one
 * flat image would kill the motion — the combined lockup exists only for
 * link previews, where a single static image is all you get.
 *
 * Motion is wrapped in a reduced-motion guard: a slow drift is pleasant
 * for most people and genuinely unpleasant for some.
 */
export function BrandHero({
  name,
  tagline,
  accent,
  markUrl,
  overlayUrl,
}: {
  name: string;
  tagline?: string | null;
  accent: string;
  markUrl?: string | null;
  overlayUrl?: string | null;
}) {
  return (
    <header className="relative overflow-hidden border-b border-white/10 bg-[#07070D]">
      {/* Ambient colour field */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50rem 30rem at 20% 0%, rgba(157,255,60,.14), transparent 60%)," +
            "radial-gradient(45rem 28rem at 85% 20%, rgba(190,80,255,.18), transparent 60%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div className="order-2 text-center sm:order-1 sm:text-left">
          <h1
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
            style={{ color: accent }}
          >
            {name}
          </h1>
          {tagline && (
            <p className="mt-3 max-w-md text-lg text-zinc-300">{tagline}</p>
          )}
          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-zinc-500">
            Menu · Not a store
          </p>
        </div>

        {markUrl && (
          <div className="relative order-1 h-56 w-56 shrink-0 sm:order-2 sm:h-72 sm:w-72">
            <Image
              src={markUrl}
              alt={`${name} logo`}
              fill
              priority
              sizes="(max-width: 640px) 224px, 288px"
              className="object-contain drop-shadow-[0_0_40px_rgba(157,255,60,0.18)]"
            />

            {/* Mascot rides above the mark, on its own layer. */}
            {overlayUrl && (
              <div className="hsm-float pointer-events-none absolute -right-6 -top-10 h-32 w-32 sm:-right-10 sm:-top-14 sm:h-44 sm:w-44">
                <Image
                  src={overlayUrl}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 640px) 128px, 176px"
                  className="object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
