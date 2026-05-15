import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";
import { hashSessionToken, isMfaCookieValid, MFA_VERIFIED_COOKIE, getAuthCookieSigningSecret, getRoleSessionTimeoutMs } from "../lib/session-security.js";
import { shouldRelaxSecurityForLocalTesting } from "../config/env.js";

const PUBLIC_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/signup-ceo",
  "/api/auth/verify",
  "/api/auth/refresh",
  "/api/auth/activate-seat",
  "/api/auth/mfa-status",
  "/api/auth/mfa-enroll",
  "/api/auth/mfa-verify",
  "/api/orgs/search",
  "/health",
  "/healthz"
]);

const ACCESS_TOKEN_COOKIE = "orgos_access_token";
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
    request.userOrgId = null;
    delete (request as { assertOrgAccess?: unknown }).assertOrgAccess;
    const relaxedLocalSecurity = shouldRelaxSecurityForLocalTesting(fastify.env);

    const path = normalizePath(request.url);
    const isPublicRoute = PUBLIC_ROUTES.has(path) || isDynamicPublicRoute(path);

    if (request.method === "OPTIONS") {
      return;
    }

    const headers = request.headers as unknown as Record<string, unknown>;
    const authHeader = readFirstHeaderValue(headers.authorization);
    const isBearerAuth = typeof authHeader === "string" && authHeader.trim().toLowerCase().startsWith("bearer ");
    const safeMethod = request.method === "GET" || request.method === "HEAD";

    if (!relaxedLocalSecurity && !isPublicRoute && !safeMethod && !isBearerAuth) {
      const originHeader = request.headers.origin;
      if (!originMatchesWebOrigin(originHeader, fastify.env.WEB_ORIGIN)) {
        return sendApiError(reply, request, 403, "FORBIDDEN", "Invalid request origin");
      }
    }

    const token = extractToken(headers);
    if (!token && isPublicRoute) {
      return;
    }

    if (!token) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing bearer token");
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
      .select("role, mfa_enabled, org_id")
      .eq("id", data.user.id)
      .maybeSingle();

    const profileRole = normalizeRole(profile.data?.role);
    const metadataRole = normalizeRole(data.user.user_metadata?.role);
    if (profileRole && metadataRole && profileRole !== metadataRole) {
      request.log.warn(
        {
          userId: data.user.id,
          metadataRole,
          profileRole
        },
        "Ignoring auth metadata role because profile role is authoritative"
      );
    }
    request.userRole = profileRole;
    request.userOrgId = (profile.data?.org_id as string | null | undefined) ?? null;

    if (!request.userRole && !isPublicRoute) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User role is not configured");
    }

    const mfaEnabled = profile.data?.mfa_enabled === true;
    const cookieHeader = readFirstHeaderValue(headers.cookie);
    if (!relaxedLocalSecurity && (request.userRole === "ceo" || request.userRole === "cfo") && mfaEnabled && !isMfaBypassPath(path)) {
      const mfaCookieValue = extractCookieValue(cookieHeader, MFA_VERIFIED_COOKIE);
      const mfaVerified = isMfaCookieValid(mfaCookieValue, token, getAuthCookieSigningSecret(fastify.env));
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

    if (!relaxedLocalSecurity && !isPublicRoute) {
      if (sessionResult.error) {
        request.log.warn({ err: sessionResult.error }, "Session lookup failed");
        return sendApiError(reply, request, 401, "UNAUTHORIZED", "Session not found");
      }
      if (!sessionResult.data) {
        return sendApiError(reply, request, 401, "UNAUTHORIZED", "Session not found");
      }
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
    } else if (!sessionResult.error && sessionResult.data) {
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

    if (!isPublicRoute && request.user) {
      request.assertOrgAccess = async (targetOrgId: string | null | undefined) => {
        if (!targetOrgId || typeof targetOrgId !== "string") {
          return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Organization context required");
        }
        if (!request.userOrgId) {
          return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
        }
        if (request.userOrgId !== targetOrgId) {
          return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot access other organization data");
        }
      };
    }
  });
};

export default fp(authPlugin, {
  name: "auth-plugin"
});
