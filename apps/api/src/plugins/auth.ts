import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";
import { hashSessionToken, MFA_VERIFIED_COOKIE, getRoleSessionTimeoutMs } from "../lib/session-security.js";
import { isLocalDevelopmentEnv } from "../config/env.js";

const PUBLIC_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify",
  "/api/auth/refresh",
  "/api/auth/mfa-status",
  "/api/auth/mfa-enroll",
  "/api/auth/mfa-verify",
  "/api/orgs/search",
  "/health",
  "/healthz"
]);

const ACCESS_TOKEN_COOKIE = "orgos_access_token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function extractCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

function normalizeRole(value: unknown): "ceo" | "cfo" | "manager" | "worker" | null {
  return value === "ceo" || value === "cfo" || value === "manager" || value === "worker" ? value : null;
}

function readFirstHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function extractToken(headers: Record<string, unknown>): string | null {
  const authHeader = readFirstHeaderValue(headers.authorization);
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cookieHeader = readFirstHeaderValue(headers.cookie);
  const cookieToken = extractCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE);
  return bearerToken || cookieToken;
}

function isMfaBypassPath(path: string): boolean {
  return path.startsWith("/api/auth/mfa-") || path === "/api/auth/logout";
}

function originMatchesWebOrigin(originHeader: string | undefined, webOrigin: string): boolean {
  if (!originHeader) {
    return false;
  }

  try {
    const origin = new URL(originHeader).origin;
    return origin === new URL(webOrigin).origin;
  } catch {
    return false;
  }
}

function normalizePath(url: string): string {
  const parsed = new URL(url, "http://localhost");
  return parsed.pathname;
}

function isDynamicPublicRoute(path: string): boolean {
  if (/^\/api\/recruitment\/jobs\/[0-9a-fA-F-]{36}\/apply$/.test(path)) {
    return true;
  }
  if (/^\/api\/recruitment\/referrals\/[a-zA-Z0-9_-]{12,128}\/apply$/.test(path)) {
    return true;
  }
  return false;
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    request.user = null;
    request.userRole = null;
    const localDevelopment = isLocalDevelopmentEnv(fastify.env);

    const path = normalizePath(request.url);
    const isPublicRoute = PUBLIC_ROUTES.has(path) || isDynamicPublicRoute(path);

    const headers = request.headers as unknown as Record<string, unknown>;
    const token = extractToken(headers);
    if (!token && isPublicRoute) {
      return;
    }

    if (!token) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing bearer token");
    }

    const authHeader = readFirstHeaderValue(headers.authorization);
    const cookieHeader = readFirstHeaderValue(headers.cookie);
    const usingCookieAuth = !authHeader && !!extractCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE);
    if (!localDevelopment && usingCookieAuth && MUTATING_METHODS.has(request.method) && !isPublicRoute) {
      const originHeader = request.headers.origin;
      if (!originMatchesWebOrigin(originHeader, fastify.env.WEB_ORIGIN)) {
        return sendApiError(reply, request, 403, "FORBIDDEN", "Invalid request origin");
      }
    }

    const { data, error } = await fastify.supabaseAnon.auth.getUser(token);
    if (error || !data.user) {
      if (isPublicRoute) {
        return;
      }
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Invalid or expired token");
    }

    request.user = data.user;

    const profile = await fastify.supabaseService
      .from("users")
      .select("role, mfa_enabled")
      .eq("id", data.user.id)
      .maybeSingle();

    const profileRole = normalizeRole(profile.data?.role);
    const metadataRole = normalizeRole(data.user.user_metadata?.role);
    request.userRole = profileRole ?? metadataRole;

    const mfaEnabled = profile.data?.mfa_enabled === true;
    if (!localDevelopment && (request.userRole === "ceo" || request.userRole === "cfo") && mfaEnabled && !isMfaBypassPath(path)) {
      const mfaVerified = extractCookieValue(cookieHeader, MFA_VERIFIED_COOKIE) === "1";
      if (!mfaVerified) {
        return sendApiError(reply, request, 403, "MFA_REQUIRED", "MFA verification required", {
          setupPath: "/setup-mfa"
        });
      }
    }

    const sessionTokenHash = hashSessionToken(token);
    const sessionResult = await fastify.supabaseService
      .from("sessions")
      .select("id, revoked, last_active, created_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (!sessionResult.error && sessionResult.data) {
      const timeoutMs = getRoleSessionTimeoutMs(request.userRole);
      const lastActive = sessionResult.data.last_active ? new Date(String(sessionResult.data.last_active)) : null;
      const createdAt = sessionResult.data.created_at ? new Date(String(sessionResult.data.created_at)) : null;
      const sessionAgeMs = Date.now() - (lastActive?.getTime() ?? createdAt?.getTime() ?? Date.now());

      if (sessionResult.data.revoked || sessionAgeMs > timeoutMs) {
        return sendApiError(reply, request, 401, "SESSION_EXPIRED", "Session expired");
      }

      await fastify.supabaseService
        .from("sessions")
        .update({ last_active: new Date().toISOString() })
        .eq("id", sessionResult.data.id);
    }
  });
};

export default fp(authPlugin, {
  name: "auth-plugin"
});
