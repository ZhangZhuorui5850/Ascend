import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUser } from "./src/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
