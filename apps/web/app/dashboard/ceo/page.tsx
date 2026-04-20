import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CeoApprovalDashboard } from "@/components/ceo-approval-dashboard";
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
      eyebrow="CEO dashboard"
      title="Executive control center"
      description="Switch between approvals and org setup to onboard members and manage level structure from one place."
    >
      <CeoApprovalDashboard />
    </AppShell>
  );
}