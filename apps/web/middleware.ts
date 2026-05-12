import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, MFA_VERIFIED_COOKIE, ROLE_COOKIE } from "./lib/auth";

const PROTECTED_PREFIXES = ["/dashboard", "/complete-profile", "/pending", "/setup-mfa", "/settings"];

function hasProtectedPrefix(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localDevelopment = request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";

  if (localDevelopment) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const role = request.cookies.get(ROLE_COOKIE)?.value;
  const mfaVerified = Boolean(request.cookies.get(MFA_VERIFIED_COOKIE)?.value);
  const authEntryPages = new Set(["/login", "/register", "/verify"]);

  if (authEntryPages.has(pathname) && accessToken) {
    if ((role === "ceo" || role === "cfo") && !mfaVerified) {
      return NextResponse.redirect(new URL("/setup-mfa", request.url));
    }
    return NextResponse.redirect(new URL(role ? `/dashboard/${role}` : "/dashboard", request.url));
  }

  if (hasProtectedPrefix(pathname)) {
    if (!accessToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if ((role === "ceo" || role === "cfo") && pathname.startsWith("/dashboard") && !mfaVerified) {
      return NextResponse.redirect(new URL("/setup-mfa", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/verify", "/complete-profile", "/pending"]
};