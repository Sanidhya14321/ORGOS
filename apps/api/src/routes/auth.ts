import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UserSchema } from "@orgos/shared-types";
import { sendApiError } from "../lib/errors.js";

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
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

    const userQuery = await fastify.supabaseService
      .from("users")
      .select("id, email, full_name, role, department, skills, agent_enabled")
      .eq("id", data.user.id)
      .maybeSingle();

    if (userQuery.error || !userQuery.data) {
      request.log.error({ err: userQuery.error }, "Failed to load user profile");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Unable to load user profile");
    }

    const userParsed = UserSchema.safeParse(userQuery.data);
    if (!userParsed.success) {
      request.log.error({ err: userParsed.error.flatten() }, "Invalid user profile format");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Invalid user profile format");
    }

    return reply.send({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: userParsed.data
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
