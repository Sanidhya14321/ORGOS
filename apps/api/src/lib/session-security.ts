import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";

export const MFA_VERIFIED_COOKIE = "orgos_mfa_verified";

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRoleSessionTimeoutMs(role: string | null | undefined): number {
  return role === "ceo" || role === "cfo" ? 2 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
}

export function getRoleSessionLimit(role: string | null | undefined): number {
  return role === "ceo" || role === "cfo" ? 5 : 3;
}

export function buildSessionMetadata(request: FastifyRequest): {
  device: string | null;
  browser: string | null;
  ip: string | null;
  country: string | null;
} {
  const browser = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null;
  const ip = request.ip ?? null;
  const countryHeader = request.headers["x-vercel-ip-country"];
  const country = typeof countryHeader === "string" ? countryHeader : null;

  return {
    device: browser,
    browser,
    ip,
    country
  };
}

export function buildMfaCookie(secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${MFA_VERIFIED_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=7200`;
}

export function buildClearMfaCookie(secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${MFA_VERIFIED_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=0`;
}