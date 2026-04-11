import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { buildUserProfileFromAuthUser, loadUserProfile, persistUserProfile } from "../lib/user-profile.js";

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const RegisterBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8),
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

    return reply.send({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
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

    const { email, fullName, password, department } = parsed.data;

    const createResult = await fastify.supabaseService.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "worker",
        department,
        agent_enabled: true
      }
    });

    if (createResult.error || !createResult.data.user) {
      const message = createResult.error?.message ?? "Unable to create account";
      const status = message.toLowerCase().includes("already") ? 409 : 500;
      const code = status === 409 ? "CONFLICT" : "INTERNAL_ERROR";
      return sendApiError(reply, request, status, code, message);
    }

    const createdUser = createResult.data.user;
    const profile = buildUserProfileFromAuthUser({
      id: createdUser.id,
      ...(createdUser.email ? { email: createdUser.email } : {}),
      user_metadata: createdUser.user_metadata as Record<string, unknown> | null
    });

    await persistUserProfile(fastify, profile);

    const { data, error } = await fastify.supabaseAnon.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      request.log.warn({ err: error }, "Created user but failed to establish a session");

      await fastify.supabaseService.auth.admin.deleteUser(createdUser.id).catch((cleanupError) => {
        request.log.warn({ err: cleanupError }, "Failed to clean up auth user after registration failure");
      });

      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Unable to start session after registration");
    }

    const userProfile = await loadUserProfile(fastify, data.user);

    return reply.status(201).send({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: userProfile
    });
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

    return reply.send({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token
    });
  });

  fastify.post("/auth/logout", async (_request, reply) => {
    await fastify.supabaseAnon.auth.signOut();
    return reply.status(204).send();
  });
};

export default authRoutes;
