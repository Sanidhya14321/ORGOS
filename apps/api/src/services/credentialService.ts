import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { FastifyInstance } from "fastify";
import { SupabaseClient } from "@supabase/supabase-js";
import { PositionCredential } from "@orgos/shared-types";

const BCRYPT_ROUNDS = 12;
const PASSWORD_LENGTH = 16;
const INVITE_CODE_LENGTH = 8;

type IssueMode = "invite" | "temporary_password" | "hybrid";

type CredentialIssueOptions = {
  inviteEmail?: string;
  issueMode?: IssueMode;
  invitationBaseUrl?: string;
};

type PositionCredentialDisplay = {
  id: string;
  plaintext_password: string;
  email: string;
  invite_code: string;
  invitation_url: string;
  activation_status: "pending";
  issued_mode: IssueMode;
};

type TeamDirectorySeat = {
  position_id: string;
  position_title: string;
  level: number;
  department: string | null;
  branch_id: string | null;
  branch_name: string | null;
  power_level: number;
  visibility_scope: string;
  seat_label: string | null;
  assignment_status: string;
  activation_state: string;
  user_id: string | null;
  occupant_name: string | null;
  occupant_email: string | null;
  invite_email: string | null;
  email: string | null;
  invite_code: string | null;
  invitation_url: string | null;
  activation_status: string | null;
  issued_mode: string | null;
  force_password_change: boolean;
  invite_expires_at: string | null;
  activated_at: string | null;
};

export function generateRandomPassword(length: number = PASSWORD_LENGTH): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function generateInviteCode(): string {
  return crypto.randomBytes(INVITE_CODE_LENGTH).toString("hex").slice(0, INVITE_CODE_LENGTH).toUpperCase();
}

function buildInvitationUrl(token: string, invitationBaseUrl?: string): string {
  const base = invitationBaseUrl ?? process.env.WEB_ORIGIN ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/activate?token=${encodeURIComponent(token)}`;
}

function resolvePositionRole(position: { level?: number | null; title?: string | null }): "ceo" | "cfo" | "manager" | "worker" {
  const title = (position.title ?? "").toLowerCase();
  if (title.includes("chief financial") || title === "cfo") {
    return "cfo";
  }
  const level = Number(position.level ?? 2);
  if (level <= 0 && (title.includes("chief executive") || title === "ceo")) {
    return "ceo";
  }
  if (level <= 1) {
    return title.includes("financial") ? "cfo" : "manager";
  }
  return "worker";
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

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

export async function ensurePositionAssignment(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    positionId: string;
    branchId?: string | null;
    inviteEmail?: string | null;
    seatLabel?: string | null;
    assignmentStatus?: "vacant" | "invited" | "active" | "inactive";
    activationState?: "pending" | "activated" | "suspended" | "revoked";
    invitedBy?: string | null;
    userId?: string | null;
  }
): Promise<string> {
  const existing = await supabase
    .from("position_assignments")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("position_id", params.positionId)
    .maybeSingle();

  const payload = {
    org_id: params.orgId,
    position_id: params.positionId,
    branch_id: params.branchId ?? null,
    seat_label: params.seatLabel ?? null,
    assignment_status: params.assignmentStatus ?? "invited",
    activation_state: params.activationState ?? "pending",
    invite_email: params.inviteEmail ?? null,
    invited_by: params.invitedBy ?? null,
    user_id: params.userId ?? null,
    invited_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (existing.error) {
    throw new Error(`Failed to resolve position assignment: ${existing.error.message}`);
  }

  if (existing.data?.id) {
    const updateResult = await supabase
      .from("position_assignments")
      .update(payload)
      .select("id")
      .eq("id", existing.data.id);
    if (updateResult.error) {
      throw new Error(`Failed to update position assignment: ${updateResult.error.message}`);
    }
    return String(existing.data.id);
  }

  const insertResult = await supabase
    .from("position_assignments")
    .insert({
      ...payload,
      created_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (insertResult.error || !insertResult.data) {
    throw new Error(`Failed to create position assignment: ${insertResult.error.message}`);
  }
  return String(insertResult.data.id);
}

export async function createPositionCredentials(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string,
  email: string,
  options: CredentialIssueOptions = {}
): Promise<PositionCredentialDisplay> {
  const plaintext = generateRandomPassword();
  const hash = await hashPassword(plaintext);
  const inviteToken = generateInviteToken();
  const inviteCode = generateInviteCode();
  const issueMode = options.issueMode ?? "hybrid";
  const invitationUrl = buildInvitationUrl(inviteToken, options.invitationBaseUrl);
  const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  const { data, error } = await supabase
    .from("position_credentials")
    .upsert({
      org_id: orgId,
      position_id: positionId,
      email,
      invite_email: options.inviteEmail ?? null,
      password_hash: hash,
      invite_token: inviteToken,
      invite_code: inviteCode,
      invitation_url: invitationUrl,
      force_password_change: true,
      activation_status: "pending",
      issued_mode: issueMode,
      invite_expires_at: inviteExpiresAt,
      activated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "org_id,position_id" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create position credentials: ${error?.message ?? "unknown error"}`);
  }

  return {
    id: data.id as string,
    plaintext_password: plaintext,
    email,
    invite_code: inviteCode,
    invitation_url: invitationUrl,
    activation_status: "pending",
    issued_mode: issueMode
  };
}

export async function resetPositionCredentials(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string,
  options: CredentialIssueOptions = {}
): Promise<PositionCredentialDisplay> {
  const existing = await getPositionCredentials(supabase, orgId, positionId);
  if (!existing) {
    throw new Error("Position credentials not found");
  }

  const plaintext = generateRandomPassword();
  const hash = await hashPassword(plaintext);
  const inviteToken = generateInviteToken();
  const inviteCode = generateInviteCode();
  const issueMode = options.issueMode ?? (existing.issued_mode as IssueMode | undefined) ?? "hybrid";
  const invitationUrl = buildInvitationUrl(inviteToken, options.invitationBaseUrl);
  const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  const { error } = await supabase
    .from("position_credentials")
    .update({
      password_hash: hash,
      reset_at: new Date().toISOString(),
      first_login_at: null,
      force_password_change: true,
      activation_status: "pending",
      issued_mode: issueMode,
      invite_token: inviteToken,
      invite_code: inviteCode,
      invitation_url: invitationUrl,
      invite_expires_at: inviteExpiresAt,
      activated_at: null,
      auth_user_id: null,
      updated_at: new Date().toISOString()
    })
    .eq("org_id", orgId)
    .eq("position_id", positionId);

  if (error) {
    throw new Error(`Failed to reset position credentials: ${error.message}`);
  }

  return {
    id: existing.id,
    plaintext_password: plaintext,
    email: existing.email,
    invite_code: inviteCode,
    invitation_url: invitationUrl,
    activation_status: "pending",
    issued_mode: issueMode
  };
}

export async function exportOrgCredentials(supabase: SupabaseClient, orgId: string): Promise<TeamDirectorySeat[]> {
  const positionsResult = await supabase
    .from("positions")
    .select("id, title, level, department, branch_id, power_level, visibility_scope")
    .eq("org_id", orgId)
    .order("level", { ascending: true })
    .order("title", { ascending: true });

  if (positionsResult.error) {
    throw new Error(`Failed to fetch positions: ${positionsResult.error.message}`);
  }

  const credentialsResult = await supabase
    .from("position_credentials")
    .select("position_id, email, invite_email, invite_code, invitation_url, activation_status, issued_mode, force_password_change, invite_expires_at, activated_at")
    .eq("org_id", orgId);
  if (credentialsResult.error) {
    throw new Error(`Failed to fetch position credentials: ${credentialsResult.error.message}`);
  }

  const assignmentsResult = await supabase
    .from("position_assignments")
    .select("position_id, user_id, seat_label, assignment_status, activation_state, invite_email, branch_id")
    .eq("org_id", orgId)
    .is("deactivated_at", null);
  if (assignmentsResult.error) {
    throw new Error(`Failed to fetch position assignments: ${assignmentsResult.error.message}`);
  }

  const usersResult = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("org_id", orgId);
  if (usersResult.error) {
    throw new Error(`Failed to fetch users: ${usersResult.error.message}`);
  }

  const branchesResult = await supabase
    .from("org_branches")
    .select("id, name")
    .eq("org_id", orgId);
  if (branchesResult.error && String(branchesResult.error.code) !== "PGRST205") {
    throw new Error(`Failed to fetch branches: ${branchesResult.error.message}`);
  }

  const credentialByPosition = new Map<string, Record<string, unknown>>();
  for (const row of credentialsResult.data ?? []) {
    credentialByPosition.set(String(row.position_id), row as Record<string, unknown>);
  }

  const assignmentByPosition = new Map<string, Record<string, unknown>>();
  for (const row of assignmentsResult.data ?? []) {
    assignmentByPosition.set(String(row.position_id), row as Record<string, unknown>);
  }

  const userById = new Map<string, { full_name: string | null; email: string | null }>();
  for (const row of usersResult.data ?? []) {
    userById.set(String(row.id), {
      full_name: (row.full_name as string | null | undefined) ?? null,
      email: (row.email as string | null | undefined) ?? null
    });
  }

  const branchById = new Map<string, string>();
  for (const row of branchesResult.data ?? []) {
    branchById.set(String(row.id), String(row.name));
  }

  return (positionsResult.data ?? []).map((position) => {
    const credential = credentialByPosition.get(String(position.id));
    const assignment = assignmentByPosition.get(String(position.id));
    const occupant = assignment?.user_id ? userById.get(String(assignment.user_id)) : null;
    const branchId = ((assignment?.branch_id ?? position.branch_id) as string | null | undefined) ?? null;

    return {
      position_id: String(position.id),
      position_title: String(position.title),
      level: Number(position.level ?? 0),
      department: ((position.department as string | null | undefined) ?? null),
      branch_id: branchId,
      branch_name: branchId ? branchById.get(branchId) ?? null : null,
      power_level: Number(position.power_level ?? 50),
      visibility_scope: String(position.visibility_scope ?? "org"),
      seat_label: (assignment?.seat_label as string | null | undefined) ?? null,
      assignment_status: String(assignment?.assignment_status ?? "vacant"),
      activation_state: String(assignment?.activation_state ?? "pending"),
      user_id: (assignment?.user_id as string | null | undefined) ?? null,
      occupant_name: occupant?.full_name ?? null,
      occupant_email: occupant?.email ?? null,
      invite_email: ((credential?.invite_email as string | null | undefined) ?? (assignment?.invite_email as string | null | undefined) ?? null),
      email: (credential?.email as string | null | undefined) ?? null,
      invite_code: (credential?.invite_code as string | null | undefined) ?? null,
      invitation_url: (credential?.invitation_url as string | null | undefined) ?? null,
      activation_status: (credential?.activation_status as string | null | undefined) ?? null,
      issued_mode: (credential?.issued_mode as string | null | undefined) ?? null,
      force_password_change: Boolean(credential?.force_password_change ?? false),
      invite_expires_at: (credential?.invite_expires_at as string | null | undefined) ?? null,
      activated_at: (credential?.activated_at as string | null | undefined) ?? null
    };
  });
}

export async function activatePositionCredential(
  fastify: FastifyInstance,
  payload: {
    inviteToken?: string;
    inviteCode?: string;
    email?: string;
    temporaryPassword?: string;
    password: string;
    fullName: string;
    department?: string;
    skills?: string[];
  }
): Promise<{ userId: string; role: "ceo" | "cfo" | "manager" | "worker"; orgId: string; positionId: string; email: string }> {
  let query = fastify.supabaseService
    .from("position_credentials")
    .select("id, org_id, position_id, email, password_hash, invite_token, invite_code, activation_status");

  if (payload.inviteToken) {
    query = query.eq("invite_token", payload.inviteToken);
  } else if (payload.inviteCode) {
    query = query.eq("invite_code", payload.inviteCode.toUpperCase());
  } else if (payload.email) {
    query = query.ilike("email", payload.email);
  } else {
    throw new Error("Activation requires an invite token, invite code, or email");
  }

  const credentialResult = await query.maybeSingle();
  if (credentialResult.error || !credentialResult.data) {
    throw new Error("Activation record not found");
  }

  if (credentialResult.data.activation_status === "activated") {
    throw new Error("This seat has already been activated");
  }

  if (!payload.inviteToken && !payload.inviteCode) {
    if (!payload.temporaryPassword) {
      throw new Error("Temporary password required");
    }
    const matches = await verifyPassword(payload.temporaryPassword, String(credentialResult.data.password_hash));
    if (!matches) {
      throw new Error("Invalid temporary password");
    }
  }

  const positionResult = await fastify.supabaseService
    .from("positions")
    .select("id, org_id, title, level, department")
    .eq("id", credentialResult.data.position_id as string)
    .maybeSingle();
  if (positionResult.error || !positionResult.data) {
    throw new Error("Position not found");
  }

  const role = resolvePositionRole({
    level: Number(positionResult.data.level ?? 2),
    title: String(positionResult.data.title ?? "")
  });

  const createdUser = await fastify.supabaseService.auth.admin.createUser({
    email: String(credentialResult.data.email),
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      full_name: payload.fullName,
      role,
      department: payload.department ?? positionResult.data.department ?? null,
      agent_enabled: true
    }
  });

  if (createdUser.error || !createdUser.data.user?.id) {
    throw new Error(createdUser.error?.message ?? "Failed to create the employee login");
  }

  const userId = createdUser.data.user.id;
  const profileUpsert = await fastify.supabaseService
    .from("users")
    .upsert({
      id: userId,
      email: credentialResult.data.email,
      full_name: payload.fullName,
      role,
      status: "active",
      org_id: credentialResult.data.org_id,
      position_id: credentialResult.data.position_id,
      department: payload.department ?? positionResult.data.department ?? null,
      skills: payload.skills ?? [],
      email_verified: true
    }, { onConflict: "id" });

  if (profileUpsert.error) {
    throw new Error(`Failed to persist the employee profile: ${profileUpsert.error.message}`);
  }

  await fastify.supabaseService
    .from("position_credentials")
    .update({
      activation_status: "activated",
      activated_at: new Date().toISOString(),
      auth_user_id: userId,
      first_login_at: new Date().toISOString(),
      force_password_change: false,
      invite_token: null,
      invite_code: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", credentialResult.data.id as string);

  await ensurePositionAssignment(fastify.supabaseService, {
    orgId: String(credentialResult.data.org_id),
    positionId: String(credentialResult.data.position_id),
    inviteEmail: String(credentialResult.data.email),
    assignmentStatus: "active",
    activationState: "activated",
    userId
  });

  return {
    userId,
    role,
    orgId: String(credentialResult.data.org_id),
    positionId: String(credentialResult.data.position_id),
    email: String(credentialResult.data.email)
  };
}

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
  const { data: cred, error: credError } = await fastify.supabaseService
    .from("position_credentials")
    .select("position_id, password_hash, force_password_change")
    .eq("org_id", orgId)
    .ilike("email", email)
    .single();

  if (credError || !cred) {
    throw new Error("Invalid credentials");
  }

  const matches = await verifyPassword(plaintext, String(cred.password_hash));
  if (!matches) {
    throw new Error("Invalid credentials");
  }

  const { data: existingUser } = await fastify.supabaseService
    .from("users")
    .select("id")
    .ilike("email", email)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existingUser) {
    throw new Error("Seat must be activated before login");
  }

  return {
    user_id: String(existingUser.id),
    force_password_change: Boolean(cred.force_password_change),
    position_id: String(cred.position_id)
  };
}

export async function markFirstLoginCompleted(
  supabase: SupabaseClient,
  orgId: string,
  positionId: string
): Promise<void> {
  const { error } = await supabase
    .from("position_credentials")
    .update({
      force_password_change: false,
      first_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("org_id", orgId)
    .eq("position_id", positionId);

  if (error) {
    throw new Error(`Failed to mark first login: ${error.message}`);
  }
}
