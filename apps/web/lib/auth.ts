export const ACCESS_TOKEN_COOKIE = "orgos_access_token";
export const MFA_VERIFIED_COOKIE = "orgos_mfa_verified";
const LEGACY_ROLE_COOKIE = "orgos_role";

export function clearAuthCookies(): void {
  document.cookie = `${LEGACY_ROLE_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = `${MFA_VERIFIED_COOKIE}=; Path=/; Max-Age=0`;
}
