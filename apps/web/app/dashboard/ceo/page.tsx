import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";

export default function CeoDashboardPage() {
  const cookieRole = cookies().get(ROLE_COOKIE)?.value as Role | undefined;

  if (!cookieRole) {
    redirect("/login");
  }

  if (cookieRole !== "ceo") {
    redirect(`/dashboard/${cookieRole}`);
  }

  return <RoleDashboard role="ceo" />;
}