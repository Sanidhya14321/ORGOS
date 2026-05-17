export type AuthSessionResponse = {
  user: { role: string; status?: string };
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
};

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export function resolvePostLoginPath(data: AuthSessionResponse): string {
  const localDevelopment =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  if (
    !localDevelopment &&
    (data.mfaRequired || data.mfaSetupRequired) &&
    (data.user.role === "ceo" || data.user.role === "cfo")
  ) {
    return "/setup-mfa";
  }

  if (data.user.status === "pending") {
    return "/pending";
  }

  return `/dashboard/${data.user.role}`;
}

export async function completeOAuthSession(accessToken: string): Promise<AuthSessionResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
    credentials: "include"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "OAuth sign-in failed");
  }

  return response.json() as Promise<AuthSessionResponse>;
}
