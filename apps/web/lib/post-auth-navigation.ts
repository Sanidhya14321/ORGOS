import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Role } from "@/lib/models";

export type AuthSessionResponse = {
  user: {
    role: Role;
    status?: string;
  };
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
};

export function navigateAfterAuth(router: AppRouterInstance, data: AuthSessionResponse): void {
  const localDevelopment =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  if (
    !localDevelopment &&
    (data.mfaRequired || data.mfaSetupRequired) &&
    (data.user.role === "ceo" || data.user.role === "cfo")
  ) {
    router.push("/setup-mfa");
  } else if (data.user.status === "pending") {
    router.push("/pending");
  } else {
    router.push(`/dashboard/${data.user.role}`);
  }
  router.refresh();
}
