import type { FastifyPluginAsync } from "fastify";
import { UserPreferencesUpdateSchema, UserApiKeyCreateSchema, ChangePasswordSchema } from "@orgos/shared-types";
import { sendApiError } from "../lib/errors.js";
import crypto from "crypto";

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /settings/preferences
  fastify.get("/settings/preferences", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "User not authenticated");
    }

    try {
      const { data, error } = await fastify.supabaseService
        .from("user_preferences")
        .select("*")
        .eq("user_id", request.user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching preferences:", error);
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch preferences");
      }

      // If no preferences exist, create defaults
      if (!data) {
        const defaults = {
          user_id: request.user.id,
          theme: "dark",
          language: "en",
          time_format: "24h",
          email_notifications: true,
          task_assigned: true,
          task_updated: true,
          sla_breached: true,
          interview_scheduled: true,
          meeting_digest: false,
        };

        await fastify.supabaseService
          .from("user_preferences")
          .insert([defaults]);

        return reply.send({ prefs: defaults });
      }

      return reply.send({ prefs: data });
    } catch (err) {
      console.error("Error in GET /settings/preferences:", err);
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch preferences");
    }
  });

  // PATCH /settings/preferences
  fastify.patch("/settings/preferences", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "User not authenticated");
    }

    const parsed = UserPreferencesUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid preferences data", {
        details: parsed.error.flatten()
      });
    }

    try {
      // Ensure preferences exist
      const { data: existing } = await fastify.supabaseService
        .from("user_preferences")
        .select("id")
        .eq("user_id", request.user.id)
        .maybeSingle();

      if (!existing) {
        const defaults = {
          user_id: request.user.id,
          theme: "dark",
          language: "en",
          time_format: "24h",
          email_notifications: true,
          task_assigned: true,
          task_updated: true,
          sla_breached: true,
          interview_scheduled: true,
          meeting_digest: false,
        };
        await fastify.supabaseService.from("user_preferences").insert([defaults]);
      }

      await fastify.supabaseService
        .from("user_preferences")
        .update(parsed.data)
        .eq("user_id", request.user.id);

      // Fetch and return updated preferences
      const { data } = await fastify.supabaseService
        .from("user_preferences")
        .select("*")
        .eq("user_id", request.user.id)
        .maybeSingle();

      return reply.send({ prefs: data });
    } catch (err) {
      console.error("Error in PATCH /settings/preferences:", err);
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update preferences");
    }
  });

  // GET /settings/api-keys
  fastify.get("/settings/api-keys", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "User not authenticated");
    }

    try {
      const { data, error } = await fastify.supabaseService
        .from("user_api_keys")
        .select("id, name, key_prefix, last_used_at, expires_at, created_at")
        .eq("user_id", request.user.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching API keys:", error);
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch API keys");
      }

      return reply.send({ keys: data ?? [] });
    } catch (err) {
      console.error("Error in GET /settings/api-keys:", err);
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch API keys");
    }
  });

  // POST /settings/api-keys
  fastify.post("/settings/api-keys", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "User not authenticated");
    }

    const parsed = UserApiKeyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid API key data", {
        details: parsed.error.flatten()
      });
    }

    try {
      // Generate new API key (sk_live_* format)
      const randomBytes = crypto.randomBytes(32).toString("hex");
      const fullKey = `sk_live_${randomBytes}`;
      const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
      const keyPrefix = fullKey.substring(0, 20);

      const { data, error } = await fastify.supabaseService
        .from("user_api_keys")
        .insert([{
          user_id: request.user.id,
          name: parsed.data.name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          expires_at: parsed.data.expires_at,
        }])
        .select("id, name, key_prefix, expires_at, created_at");

      if (error || !data || data.length === 0) {
        console.error("Error creating API key:", error);
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create API key");
      }

      // Return full key only once
      const keyData: any = data[0];
      keyData.key = fullKey;

      return reply.send({ key: keyData });
    } catch (err) {
      console.error("Error in POST /settings/api-keys:", err);
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create API key");
    }
  });

  // DELETE /settings/api-keys/:id
  fastify.delete<{ Params: { id: string } }>("/settings/api-keys/:id", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "User not authenticated");
    }

    try {
      await fastify.supabaseService
        .from("user_api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", request.params.id)
        .eq("user_id", request.user.id);

      return reply.send({ success: true });
    } catch (err) {
      console.error("Error in DELETE /settings/api-keys/:id:", err);
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to revoke API key");
    }
  });

  // POST /settings/change-password
  fastify.post("/settings/change-password", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "User not authenticated");
    }

    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid password data", {
        details: parsed.error.flatten()
      });
    }

    try {
      if (!request.user.email) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Missing authenticated email");
      }

      const credentialCheck = await fastify.supabaseAnon.auth.signInWithPassword({
        email: request.user.email,
        password: parsed.data.current_password
      });

      if (credentialCheck.error || !credentialCheck.data.user) {
        return sendApiError(reply, request, 401, "UNAUTHORIZED", "Current password is incorrect");
      }

      // Use Supabase Auth Admin API to update password
      const { error } = await fastify.supabaseService.auth.admin.updateUserById(
        request.user.id,
        { password: parsed.data.new_password }
      );

      if (error) {
        console.error("Error changing password:", error);
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Failed to change password", {
          details: error.message
        });
      }

      return reply.send({ success: true });
    } catch (err) {
      console.error("Error in POST /settings/change-password:", err);
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to change password");
    }
  });
};

export default settingsRoutes;
