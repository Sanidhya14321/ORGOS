import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_TOKEN_COOKIE, MFA_VERIFIED_COOKIE } from "@/lib/auth";
import type { Role, User } from "@/lib/models";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type MfaStatus = {
  required: boolean;
  enabled: boolean;
  role?: Role;
};

function isExecutiveRole(role: Role): boolean {
  return role === "ceo" || role === "cfo";
}

async function fetchServerSessionApi<T>(path: string, accessToken: string): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Failed to load session context from ${path}`);
  }

  return (await response.json()) as T;
}

export async function getServerSessionUser(): Promise<User | null> {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  return fetchServerSessionApi<User>("/api/me", accessToken);
}

export async function getServerMfaStatus(): Promise<MfaStatus | null> {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  return fetchServerSessionApi<MfaStatus>("/api/auth/mfa-status", accessToken);
}

export async function requireServerSessionUser(options?: {
  requiredRoles?: Role[];
  allowPending?: boolean;
  allowIncompleteProfile?: boolean;
  allowMfaSetup?: boolean;
}): Promise<User> {
  const user = await getServerSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!options?.allowPending && user.status === "pending") {
    redirect("/pending");
  }

  if (!options?.allowIncompleteProfile && !user.org_id && user.role !== "ceo" && user.role !== "cfo") {
    redirect("/complete-profile");
  }

  if (options?.requiredRoles && !options.requiredRoles.includes(user.role)) {
    redirect(`/dashboard/${user.role}`);
  }

  if (!options?.allowMfaSetup && isExecutiveRole(user.role)) {
    const mfaStatus = await getServerMfaStatus();
    const mfaVerified = Boolean(cookies().get(MFA_VERIFIED_COOKIE)?.value);
    if (mfaStatus?.required && !mfaVerified) {
      redirect("/setup-mfa");
    }
  }

  return user;
}
