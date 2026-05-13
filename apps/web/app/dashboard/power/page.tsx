import { requireServerSessionUser } from "@/lib/server-session";
import { PositionPowerDashboard } from "@/components/dashboard/position-power-dashboard";

export default async function PowerDashboardPage() {
  await requireServerSessionUser({ requiredRoles: ["ceo", "cfo", "manager"] });
  return <PositionPowerDashboard />;
}
