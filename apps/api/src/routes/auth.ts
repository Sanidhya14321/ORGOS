import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { buildUserProfileFromAuthUser, loadUserProfile, persistUserProfile } from "../lib/user-profile.js";

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

    const secureCookie = fastify.env.NODE_ENV === "production";
    reply.header("Set-Cookie", buildCookie(data.session.access_token, secureCookie));

    return reply.send({
      user: userProfile
    });
  });

  fastify.post("/auth/register", async (request, reply) => {
    const parsed = RegisterBodySchema.safeParse(request.body);

    if (!parsed.success) {
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
    reply.header("Set-Cookie", buildCookie(data.session.access_token, secureCookie));

    return reply.send({
      refreshToken: data.session.refresh_token
    });
  });

  fastify.post("/auth/logout", async (request, reply) => {
    await fastify.supabaseAnon.auth.signOut();
    const secureCookie = fastify.env.NODE_ENV === "production";
    reply.header("Set-Cookie", buildClearCookie(secureCookie));
    request.userRole = null;
    return reply.status(204).send();
  });
};

export default authRoutes;
