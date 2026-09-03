import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, tokenIsValid } from "@/lib/mc-auth";

/**
 * Guards Mission Control. The public menu under /b/* stays open — it is
 * the whole point of the product.
 *
 * Fails CLOSED when MC_PASSWORD is unset. An unset secret that silently
 * allows access is the failure mode where dev looks fine and production
 * is wide open, so the gate refuses rather than waving traffic through.
 */
export async function proxy(req: NextRequest) {
  if (!process.env.MC_PASSWORD) {
    return NextResponse.redirect(new URL("/login?reason=unconfigured", req.url));
  }

  const ok = await tokenIsValid(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/mc/:path*"],
};
