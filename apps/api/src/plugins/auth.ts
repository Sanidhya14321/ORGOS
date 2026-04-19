import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";

const PUBLIC_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify",
  "/api/auth/refresh",
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

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    request.user = null;
    request.userRole = null;

    const path = normalizePath(request.url);
    const isPublicRoute = PUBLIC_ROUTES.has(path);

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
    if (usingCookieAuth && MUTATING_METHODS.has(request.method) && !isPublicRoute) {
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
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const profileRole = normalizeRole(profile.data?.role);
    const metadataRole = normalizeRole(data.user.user_metadata?.role);
    request.userRole = profileRole ?? metadataRole;
  });
};

export default fp(authPlugin, {
  name: "auth-plugin"
});
