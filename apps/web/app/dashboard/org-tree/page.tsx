import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OrgTreeCanvas } from "@/components/org-tree-canvas";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";

const allowedRoles: Role[] = ["ceo", "cfo", "manager"];

export default function OrgTreePage() {
  const cookieRole = cookies().get(ROLE_COOKIE)?.value as Role | undefined;

  if (!cookieRole) {
    redirect("/login");
  }

  if (!allowedRoles.includes(cookieRole)) {
    redirect(`/dashboard/${cookieRole}`);
  }

  return (
    <AppShell
      layout="stack"
      eyebrow="Org structure"
      title="Organization tree"
      description="Interactive hierarchy map of your organization, including reporting lines and position levels."
    >
      <OrgTreeCanvas />
    </AppShell>
  );
}
