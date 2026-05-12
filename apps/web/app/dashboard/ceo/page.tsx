import { RoleDashboard } from "@/components/dashboard/role-dashboard";
import { requireServerSessionUser } from "@/lib/server-session";

export default async function CeoDashboardPage() {
  await requireServerSessionUser({ requiredRoles: ["ceo"] });
  return <RoleDashboard role="ceo" />;
}