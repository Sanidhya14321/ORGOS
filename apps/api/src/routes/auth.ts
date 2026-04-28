import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { buildUserProfileFromAuthUser, loadUserProfile, persistUserProfile } from "../lib/user-profile.js";
import { buildMfaQrCodeDataUrl, buildOtpauthUri, generateMfaSecret, verifyTotp } from "../lib/mfa.js";
import {
  buildClearMfaCookie,
  buildMfaCookie,
  buildSessionMetadata,
  hashSessionToken,
  getRoleSessionLimit,
  getRoleSessionTimeoutMs
} from "../lib/session-security.js";

const ACCESS_TOKEN_COOKIE = "orgos_access_token";

function buildCookie(value: string, secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=3600`;
}

function buildClearCookie(secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${ACCESS_TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=0`;
}

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const RegisterBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(["ceo", "cfo"]).default("ceo"),
  department: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
import { writeAuditEvent } from "../lib/audit.js";
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(120).optional()
  )
});

const VerifyBodySchema = z.object({
  email: z.string().trim().email()
});

const CompleteProfileBodySchema = z.object({
  orgId: z.string().uuid(),
  positionId: z.string().uuid().optional(),
  reportsTo: z.string().uuid().optional(),
  department: z.string().trim().max(120).optional(),
  skills: z.array(z.string().trim().min(1)).max(30).optional()
});

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1)
});

const MfaEnrollBodySchema = z.object({
  secret: z.string().trim().min(16),
  code: z.string().trim().regex(/^\d{6}$/)
});

const MfaVerifyBodySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
});

const RevokeSessionParamSchema = z.object({
  id: z.string().uuid()
});

function isMissingTableSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

function readFirstHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function extractCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const item of cookieHeader.split(";")) {
    const [rawKey, ...rest] = item.trim().split("=");
    if (rawKey === name) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }

    await writeAuditEvent(fastify, {
      orgId: (userProfile as { org_id?: string | null }).org_id ?? null,
      actorId: data.user.id,
      category: "auth",
      severity: "info",
      action: "login_success",
      entity: "session",
      entityId: data.user.id,
      metadata: { mfaRequired: isExecutive && mfaEnabled },
      path: request.url,
      userAgent: request.headers["user-agent"] as string | undefined,
      ipAddress: request.ip
    });
  }

  return null;
}

function getCurrentAccessToken(request: { headers: Record<string, unknown> }): string | null {
  const authHeader = readFirstHeaderValue(request.headers.authorization);
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cookieHeader = readFirstHeaderValue(request.headers.cookie);
  const cookieToken = extractCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE);
  return bearerToken || cookieToken;
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/auth/login", async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid login payload", {
        details: parsed.error.flatten()
      });
    }

    const { email, password } = parsed.data;
    const { data, error } = await fastify.supabaseAnon.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Invalid email or password");
    }

    const userProfile = await loadUserProfile(fastify, data.user);
    const isExecutive = userProfile.role === "ceo" || userProfile.role === "cfo";
    const mfaEnabled = (userProfile as { mfa_enabled?: boolean }).mfa_enabled === true;
    const secureCookie = fastify.env.NODE_ENV === "production";

    const sessionQuery = await fastify.supabaseService
      .from("sessions")
      .select("id, last_active, revoked")
      .eq("user_id", data.user.id)
      .eq("revoked", false);

    if (!sessionQuery.error && Array.isArray(sessionQuery.data)) {
      const now = Date.now();
      const recentCount = sessionQuery.data.filter((row) => {

    await writeAuditEvent(fastify, {
      actorId: authUser.id,
      category: "security",
      severity: "info",
      action: "mfa_enrolled",
      entity: "user",
      entityId: authUser.id,
      path: request.url,
      userAgent: request.headers["user-agent"] as string | undefined,
      ipAddress: request.ip
    });
        const lastActiveValue = row.last_active ? new Date(String(row.last_active)).getTime() : now;
        return now - lastActiveValue <= getRoleSessionTimeoutMs(userProfile.role);
      }).length;

      if (recentCount >= getRoleSessionLimit(userProfile.role)) {
        await fastify.supabaseAnon.auth.signOut();
        return sendApiError(reply, request, 429, "SESSION_LIMITED", "Too many active sessions");
      }
    }

    const currentSessionTokenHash = hashSessionToken(data.session.access_token);
    const metadata = buildSessionMetadata(request);
    const sessionInsert = await fastify.supabaseService.from("sessions").upsert({
      user_id: data.user.id,
      session_token_hash: currentSessionTokenHash,
      device: metadata.device,
      browser: metadata.browser,
      ip: metadata.ip,
      country: metadata.country,
      revoked: false,
      last_active: new Date().toISOString()
    }, { onConflict: "session_token_hash" });

    if (sessionInsert.error && !isMissingTableSchemaCache(sessionInsert.error)) {
      request.log.warn({ err: sessionInsert.error }, "Failed to persist session log entry");
    }

    const cookies = [buildCookie(data.session.access_token, secureCookie), buildClearMfaCookie(secureCookie)];
    reply.header("Set-Cookie", cookies);

    return reply.send({
      user: userProfile,
      mfaRequired: isExecutive && mfaEnabled,
      mfaSetupRequired: isExecutive && !mfaEnabled
    });
  });

  fastify.post("/auth/register", async (request, reply) => {
    const parsed = RegisterBodySchema.safeParse(request.body);

    if (!parsed.success) {

    await writeAuditEvent(fastify, {
      actorId: authUser.id,
      category: "security",
      severity: "info",
      action: "mfa_verified",
      entity: "user",
      entityId: authUser.id,
      path: request.url,
      userAgent: request.headers["user-agent"] as string | undefined,
      ipAddress: request.ip
    });
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid registration payload", {
        details: parsed.error.flatten()
      });
    }

    const { email, fullName, password, department, role } = parsed.data;

    if (role !== "ceo" && role !== "cfo") {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Only executive accounts can self-register");
    }

    const createResult = await fastify.supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${fastify.env.WEB_ORIGIN}/verify`,
        data: {
          full_name: fullName,
          role,
          department,
          agent_enabled: true
        }
      }
    });

    if (createResult.error || !createResult.data.user) {
      const message = createResult.error?.message ?? "Unable to create account";
      const lowered = message.toLowerCase();

    await writeAuditEvent(fastify, {
      actorId: authUser.id,
      category: "security",
      severity: "info",
      action: "session_revoked",
      entity: "session",
      entityId: params.data.id,
      path: request.url,
      userAgent: request.headers["user-agent"] as string | undefined,
      ipAddress: request.ip
    });
      const isConflict = lowered.includes("already") || lowered.includes("exists");
      const isValidation = lowered.includes("invalid") || lowered.includes("email") || lowered.includes("password");
      const status = isConflict ? 409 : isValidation ? 400 : 500;
      const code = status === 409 ? "CONFLICT" : status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
      return sendApiError(reply, request, status, code, message);
    }

    const createdUser = createResult.data.user;
    const profile = buildUserProfileFromAuthUser({
      id: createdUser.id,
      ...(createdUser.email ? { email: createdUser.email } : {}),
      user_metadata: createdUser.user_metadata as Record<string, unknown> | null
    });

    await persistUserProfile(fastify, profile);

    return reply.status(201).send({
      requiresVerification: true,
      message: "Verification email sent"
    });

    if (request.user?.id) {
      await writeAuditEvent(fastify, {
        actorId: request.user.id,
        category: "auth",
        severity: "info",
        action: "logout",
        entity: "session",
        entityId: request.user.id,
        path: request.url,
        userAgent: request.headers["user-agent"] as string | undefined,
        ipAddress: request.ip
      });
    }
  });

  fastify.post("/auth/verify", async (request, reply) => {
    const parsed = VerifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid verify payload", {
        details: parsed.error.flatten()
      });
    }

    const authUser = request.user;
    const requestedEmail = parsed.data.email.toLowerCase();
    let resolvedRole = authUser?.user_metadata?.role as string | undefined;
    if (authUser?.email && authUser.email.toLowerCase() !== requestedEmail) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Email does not match authenticated user");
    }

    let userId = authUser?.id ?? null;
    if (!userId) {
      const existingUser = await fastify.supabaseService
        .from("users")
        .select("id, role")
        .ilike("email", requestedEmail)
        .maybeSingle();

      if (existingUser.error) {
        request.log.warn({ err: existingUser.error }, "Unable to resolve user during verify");
      }

      if (!existingUser.data?.id) {
        return sendApiError(reply, request, 404, "NOT_FOUND", "No account found for this email");
      }

      userId = existingUser.data.id;
      resolvedRole = existingUser.data.role as string | undefined;
    }

    const nextStatus = resolvedRole === "ceo" || resolvedRole === "cfo" ? "active" : "pending";

    const { error } = await fastify.supabaseService
      .from("users")
      .update({ email_verified: true, status: nextStatus })
      .eq("id", userId);

    // Keep this endpoint best-effort for compatibility if migration is not applied yet.
    if (error) {
      request.log.warn({ err: error }, "Unable to persist verify state");
    }

    return reply.status(204).send();
  });

  fastify.post("/auth/complete-profile", async (request, reply) => {
    const parsed = CompleteProfileBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid profile completion payload", {
        details: parsed.error.flatten()
      });
    }

    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterRole = request.userRole;
    const nextStatus = requesterRole === "ceo" || requesterRole === "cfo" ? "active" : "pending";

    const { orgId, positionId, reportsTo, department, skills } = parsed.data;

    let resolvedPositionId = positionId ?? null;
    if (!resolvedPositionId) {
      const targetLevel = requesterRole === "manager" ? 1 : requesterRole === "worker" ? 2 : 0;
      const inferred = await fastify.supabaseService
        .from("positions")
        .select("id")
        .eq("org_id", orgId)
        .eq("level", targetLevel)
        .order("confirmed", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (inferred.error) {
        request.log.error({ err: inferred.error }, "Failed to infer position for profile completion");
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to resolve position assignment");
      }

      if (!inferred.data?.id) {
        return sendApiError(
          reply,
          request,
          400,
          "VALIDATION_ERROR",
          "No matching position is available for your role. Ask your CEO to add positions in the CEO dashboard."
        );
      }

      resolvedPositionId = inferred.data.id;
    }

    const { error } = await fastify.supabaseService
      .from("users")
      .update({
        org_id: orgId,
        position_id: resolvedPositionId,
        reports_to: reportsTo ?? null,
        status: nextStatus,
        ...(department ? { department } : {}),
        ...(skills ? { skills } : {})
      })
      .eq("id", authUser.id);

    if (error) {
      request.log.error({ err: error }, "Failed to complete user profile");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to complete profile");
    }

    const userProfile = await loadUserProfile(fastify, authUser);
    return reply.send({ user: userProfile, status: nextStatus });
  });

  fastify.get("/auth/mfa-status", async (request, reply) => {
    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { data, error } = await fastify.supabaseService
      .from("users")
      .select("id, email, full_name, role, mfa_enabled, mfa_secret")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "MFA tables are not available yet; apply DB migrations first");
      }
      request.log.error({ err: error }, "Failed to load MFA status");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load MFA status");
    }

    const role = data?.role;
    const isExecutive = role === "ceo" || role === "cfo";
    if (!isExecutive) {
      return reply.send({ required: false, enabled: false, role });
    }

    if (data?.mfa_enabled && data.mfa_secret) {
      return reply.send({ required: true, enabled: true, role, email: data.email, fullName: data.full_name });
    }

    const secret = generateMfaSecret();
    const issuer = "ORGOS";
    const accountName = data?.email ?? authUser.email ?? `${authUser.id}@orgos.local`;
    const otpauthUri = buildOtpauthUri({ secret, issuer, accountName });
    const qrCodeDataUrl = await buildMfaQrCodeDataUrl(otpauthUri);

    return reply.send({
      required: true,
      enabled: false,
      role,
      email: data?.email ?? authUser.email,
      fullName: data?.full_name,
      secret,
      otpauthUri,
      qrCodeDataUrl
    });
  });

  fastify.post("/auth/mfa-enroll", async (request, reply) => {
    const parsed = MfaEnrollBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid MFA enrollment payload", {
        details: parsed.error.flatten()
      });
    }

    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    if (!verifyTotp(parsed.data.secret, parsed.data.code)) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid verification code");
    }

    const { error } = await fastify.supabaseService
      .from("users")
      .update({ mfa_enabled: true, mfa_secret: parsed.data.secret })
      .eq("id", authUser.id);

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "MFA tables are not available yet; apply DB migrations first");
      }
      request.log.error({ err: error }, "Failed to enroll MFA");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to enroll MFA");
    }

    const secureCookie = fastify.env.NODE_ENV === "production";
    reply.header("Set-Cookie", buildMfaCookie(secureCookie));

    return reply.send({ enrolled: true });
  });

  fastify.post("/auth/mfa-verify", async (request, reply) => {
    const parsed = MfaVerifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid MFA verification payload", {
        details: parsed.error.flatten()
      });
    }

    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const profile = await fastify.supabaseService
      .from("users")
      .select("role, mfa_enabled, mfa_secret")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profile.error) {
      if (isMissingTableSchemaCache(profile.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "MFA tables are not available yet; apply DB migrations first");
      }
      request.log.error({ err: profile.error }, "Failed to load MFA verification profile");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to verify MFA");
    }

    if (!profile.data?.mfa_enabled || !profile.data.mfa_secret) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "MFA is not enrolled for this account");
    }

    if (!verifyTotp(profile.data.mfa_secret, parsed.data.code)) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid verification code");
    }

    const secureCookie = fastify.env.NODE_ENV === "production";
    reply.header("Set-Cookie", buildMfaCookie(secureCookie));

    return reply.send({ verified: true, role: profile.data.role });
  });

  fastify.get("/auth/sessions", async (request, reply) => {
    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const currentToken = getCurrentAccessToken(request as { headers: Record<string, unknown> });
    if (!currentToken) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing session token");
    }

    const { data, error } = await fastify.supabaseService
      .from("sessions")
      .select("id, device, browser, ip, country, revoked, last_active, created_at, session_token_hash")
      .eq("user_id", authUser.id)
      .order("last_active", { ascending: false });

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Session tables are not available yet; apply DB migrations first");
      }
      request.log.error({ err: error }, "Failed to load sessions");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load sessions");
    }

    return reply.send({
      items: (data ?? []).map((session) => ({
        id: session.id,
        device: session.device,
        browser: session.browser,
        ip: session.ip,
        country: session.country,
        revoked: session.revoked,
        last_active: session.last_active,
        created_at: session.created_at,
        current: session.session_token_hash === hashSessionToken(currentToken)
      }))
    });
  });

  fastify.post("/auth/sessions/:id/revoke", async (request, reply) => {
    const params = RevokeSessionParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid session id", { details: params.error.flatten() });
    }

    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { error } = await fastify.supabaseService
      .from("sessions")
      .update({ revoked: true })
      .eq("id", params.data.id)
      .eq("user_id", authUser.id);

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Session tables are not available yet; apply DB migrations first");
      }
      request.log.error({ err: error }, "Failed to revoke session");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to revoke session");
    }

    return reply.status(204).send();
  });

  fastify.post("/auth/refresh", async (request, reply) => {
    const parsed = RefreshBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid refresh payload", {
        details: parsed.error.flatten()
      });
    }

    const { refreshToken } = parsed.data;
    const { data, error } = await fastify.supabaseAnon.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Invalid refresh token");
    }

    const secureCookie = fastify.env.NODE_ENV === "production";
    const cookies = [buildCookie(data.session.access_token, secureCookie)];

    const oldToken = getCurrentAccessToken(request as { headers: Record<string, unknown> });
    if (oldToken) {
      const updateResult = await fastify.supabaseService
        .from("sessions")
        .update({
          session_token_hash: hashSessionToken(data.session.access_token),
          last_active: new Date().toISOString(),
          revoked: false
        })
        .eq("session_token_hash", hashSessionToken(oldToken));

      if (updateResult.error && !isMissingTableSchemaCache(updateResult.error)) {
        request.log.warn({ err: updateResult.error }, "Failed to rotate session token hash during refresh");
      }
    }

    reply.header("Set-Cookie", cookies);

    return reply.send({
      refreshToken: data.session.refresh_token
    });
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const currentToken = getCurrentAccessToken(request as { headers: Record<string, unknown> });
    if (currentToken) {
      const revokeResult = await fastify.supabaseService
        .from("sessions")
        .update({ revoked: true })
        .eq("session_token_hash", hashSessionToken(currentToken));

      if (revokeResult.error && !isMissingTableSchemaCache(revokeResult.error)) {
        request.log.warn({ err: revokeResult.error }, "Failed to revoke current session on logout");
      }
    }

    await fastify.supabaseAnon.auth.signOut();
    const secureCookie = fastify.env.NODE_ENV === "production";
    reply.header("Set-Cookie", [buildClearCookie(secureCookie), buildClearMfaCookie(secureCookie)]);
    request.userRole = null;
    return reply.status(204).send();
  });
};

export default authRoutes;
