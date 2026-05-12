/**
 * Credential Service
 * Manages position credentials (email + password generation and storage)
 * Passwords are hashed (bcrypt) in database, plaintext shown only once to CEO
 */

import bcrypt from "bcrypt";
import { FastifyInstance } from "fastify";
import { SupabaseClient } from "@supabase/supabase-js";
import { PositionCredential } from "@orgos/shared-types";

const BCRYPT_ROUNDS = 12;
const PASSWORD_LENGTH = 16;

/**
 * Generate a secure random password
 */
export function generateRandomPassword(length: number = PASSWORD_LENGTH): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against bcrypt hash
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Create credentials for a position
 * Returns plaintext password (shown only once), stores hash in DB
 */
export async function createPositionCredentials(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string,
  email: string
): Promise<{ id: string; plaintext_password: string; email: string }> {
  const plaintext = generateRandomPassword();
  const hash = await hashPassword(plaintext);

  const { data, error } = await supabase
    .from("position_credentials")
    .insert({
      org_id: orgId,
      position_id: positionId,
      email,
      password_hash: hash,
      force_password_change: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create position credentials: ${error.message}`);
  }

  return {
    id: data.id,
    plaintext_password: plaintext,
    email
  };
}

/**
 * Get credentials for a position (CEO only, returns hashed password status)
 * Does NOT return plaintext
 */
export async function getPositionCredentials(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string
): Promise<PositionCredential | null> {
  const { data, error } = await supabase
    .from("position_credentials")
    .select("*")
    .eq("org_id", orgId)
    .eq("position_id", positionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch position credentials: ${error.message}`);
  }

  return data as PositionCredential | null;
}

/**
 * Reset credentials for a position
 * Generates new password, returns plaintext (shown once), stores new hash
 */
export async function resetPositionCredentials(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string
): Promise<{ plaintext_password: string; email: string }> {
  // Get existing credentials to preserve email
  const existing = await getPositionCredentials(supabase, orgId, positionId);
  if (!existing) {
    throw new Error("Position credentials not found");
  }

  const plaintext = generateRandomPassword();
  const hash = await hashPassword(plaintext);

  const { error } = await supabase
    .from("position_credentials")
    .update({
      password_hash: hash,
      reset_at: new Date().toISOString(),
      first_login_at: null,
      force_password_change: true,
      plaintext_password: null,
      updated_at: new Date().toISOString()
    })
    .eq("org_id", orgId)
    .eq("position_id", positionId);

  if (error) {
    throw new Error(`Failed to reset position credentials: ${error.message}`);
  }

  return {
    plaintext_password: plaintext,
    email: existing.email
  };
}

/**
 * Get all credentials for an organization (CEO export)
 * Returns with plaintext (one-time view, then cleared from DB)
 */
export async function exportOrgCredentials(
  supabase: SupabaseClient,
  orgId: string
): Promise<Array<{
  position_id: string;
  position_title: string;
  email: string;
  level: number;
  force_password_change: boolean;
}>> {
  // Fetch all positions with their credentials
  const { data: positions, error: posError } = await supabase
    .from("positions")
    .select("id, name, level, department")
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (posError) {
    throw new Error(`Failed to fetch positions: ${posError.message}`);
  }

  const results: Array<{
    position_id: string;
    position_title: string;
    email: string;
    level: number;
    force_password_change: boolean;
  }> = [];

  for (const position of positions || []) {
    const cred = await getPositionCredentials(supabase, orgId, position.id);
    if (cred) {
      results.push({
        position_id: position.id,
        position_title: position.name,
        email: cred.email,
        level: position.level,
        force_password_change: cred.force_password_change
      });
    }
  }

  return results;
}

/**
 * Login with position credentials (employee first login)
 * Verifies email + password, creates Supabase auth user + profile
 */
export async function loginWithPositionCredentials(
  fastify: FastifyInstance,
  orgId: string,
  email: string,
  plaintext: string
): Promise<{
  user_id: string;
  force_password_change: boolean;
  position_id: string;
}> {
  // Find position credentials
  const { data: cred, error: credError } = await fastify.supabaseService
    .from("position_credentials")
    .select("position_id, password_hash, force_password_change")
    .eq("org_id", orgId)
    .ilike("email", email)
    .single();

  if (credError || !cred) {
    throw new Error("Invalid credentials");
  }

  // Verify password
  const matches = await verifyPassword(plaintext, cred.password_hash);
  if (!matches) {
    throw new Error("Invalid credentials");
  }

  // Find or create user account
  const { data: existingUser } = await fastify.supabaseService
    .from("users")
    .select("id")
    .ilike("email", email)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existingUser) {
    return {
      user_id: existingUser.id,
      force_password_change: cred.force_password_change,
      position_id: cred.position_id
    };
  }

  // Create new user (will be linked to position during profile completion)
  const { data: newUser, error: newUserError } = await fastify.supabaseService
    .from("users")
    .insert({
      org_id: orgId,
      email,
      role: "worker", // Default, updated after position assignment
      status: "active", // Already approved by CEO
      email_verified: true
    })
    .select("id")
    .single();

  if (newUserError || !newUser) {
    throw new Error(`Failed to create user: ${newUserError?.message}`);
  }

  return {
    user_id: newUser.id,
    force_password_change: cred.force_password_change,
    position_id: cred.position_id
  };
}

/**
 * Mark first login completion + password change
 */
export async function markFirstLoginCompleted(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string
): Promise<void> {
  const { error } = await supabase
    .from("position_credentials")
    .update({
      force_password_change: false,
      first_login_at: new Date().toISOString()
    })
    .eq("org_id", orgId)
    .eq("position_id", positionId);

  if (error) {
    throw new Error(`Failed to mark first login: ${error.message}`);
  }
}
