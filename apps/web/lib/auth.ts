export const ACCESS_TOKEN_COOKIE = "orgos_access_token";
export const ROLE_COOKIE = "orgos_role";
export const MFA_VERIFIED_COOKIE = "orgos_mfa_verified";

export function setRoleCookie(role: string): void {
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax`;
}

export function clearAuthCookies(): void {
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = `${MFA_VERIFIED_COOKIE}=; Path=/; Max-Age=0`;
}

export function getRoleFromBrowser(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ROLE_COOKIE}=`));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.split("=").slice(1).join("="));
}
