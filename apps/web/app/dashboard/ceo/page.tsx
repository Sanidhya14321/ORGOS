import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CeoApprovalDashboard } from "@/components/ceo-approval-dashboard";
import ContributorsTable from "@/components/ui/ruixen-contributors-table";
import { FirstTimeUserTour } from "@/components/ui/first-time-tour";
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

  return (
    <AppShell
      layout="stack"
      role={cookieRole}
      eyebrow="CEO dashboard"
      title="Executive control center"
      description="Switch between approvals and org setup to onboard members and manage level structure from one place."
    >
        <div className="space-y-8">
          {/* Welcome tour for first-time visitors */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Welcome to ORGOS</h2>
              <p className="text-sm text-muted-foreground">Get started with a quick tour</p>
            </div>
            <FirstTimeUserTour />
          </div>

          {/* Approval Dashboard */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Pending Approvals</h2>
            <CeoApprovalDashboard />
          </div>

          {/* Projects Management */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Projects & Team Goals</h2>
            <ContributorsTable />
          </div>
        </div>
    </AppShell>
  );
}