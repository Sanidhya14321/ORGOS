import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "./lib/auth";

const PROTECTED_PREFIXES = ["/dashboard", "/complete-profile", "/pending", "/setup-mfa", "/settings", "/org-setup", "/onboarding"];

function hasProtectedPrefix(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const authEntryPages = new Set(["/login", "/register", "/verify"]);

  if (authEntryPages.has(pathname) && accessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (hasProtectedPrefix(pathname)) {
    if (!accessToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/register",
    "/verify",
    "/complete-profile",
    "/pending",
    "/setup-mfa",
    "/setup-mfa/:path*",
    "/settings",
    "/settings/:path*",
    "/org-setup",
    "/org-setup/:path*",
    "/onboarding",
    "/onboarding/:path*"
  ]
};