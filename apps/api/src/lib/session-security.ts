import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";

export const MFA_VERIFIED_COOKIE = "orgos_mfa_verified";

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildMfaCookieValue(accessToken: string, signingSecret: string): string {
  return crypto
    .createHash("sha256")
    .update(`${signingSecret}:mfa:${accessToken}`)
    .digest("hex");
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

export function getAuthCookieSigningSecret(env: Env): string {
  return env.AUTH_COOKIE_SIGNING_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY;
}

export function isMfaCookieValid(cookieValue: string | null, accessToken: string, signingSecret: string): boolean {
  if (!cookieValue) {
    return false;
  }

  const expectedValue = buildMfaCookieValue(accessToken, signingSecret);
  const actualBuffer = Buffer.from(cookieValue);
  const expectedBuffer = Buffer.from(expectedValue);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function buildMfaCookie(accessToken: string, signingSecret: string, secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${MFA_VERIFIED_COOKIE}=${buildMfaCookieValue(accessToken, signingSecret)}; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=7200`;
}

export function buildClearMfaCookie(secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${MFA_VERIFIED_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=0`;
}