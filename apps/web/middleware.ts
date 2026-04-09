import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, ROLE_COOKIE } from "./lib/auth";

const PROTECTED_PREFIXES = ["/dashboard"];

function hasProtectedPrefix(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const role = request.cookies.get(ROLE_COOKIE)?.value;

  if (pathname === "/login" && accessToken && role) {
    return NextResponse.redirect(new URL(`/dashboard/${role}`, request.url));
  }

  if (hasProtectedPrefix(pathname)) {
    if (!accessToken || !role) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const dashboardPrefix = "/dashboard/";
    if (pathname.startsWith(dashboardPrefix)) {
      const requestedRole = pathname.slice(dashboardPrefix.length).split("/")[0];
      if (requestedRole && requestedRole !== role) {
        return NextResponse.redirect(new URL(`/dashboard/${role}`, request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"]
};