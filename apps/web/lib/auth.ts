export const ACCESS_TOKEN_COOKIE = "orgos_access_token";
export const ROLE_COOKIE = "orgos_role";

export function setAuthCookies(token: string, role: string): void {
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax`;
}

export function clearAuthCookies(): void {
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0`;
}

export function getAccessTokenFromBrowser(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ACCESS_TOKEN_COOKIE}=`));

  if (!match) {
    return null;
  }

  const value = match.split("=").slice(1).join("=");
  return decodeURIComponent(value);
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
