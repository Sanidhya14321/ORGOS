import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { lazy, Suspense } from "react";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";
import { Skeleton } from "@/components/ui/skeleton";

const roles: Role[] = ["ceo", "cfo", "manager", "worker"];
const RoleDashboard = lazy(() => import("@/components/dashboard/role-dashboard").then((m) => ({ default: m.RoleDashboard })));

type DashboardRolePageProps = {
  params: { role: string };
};

export default function DashboardRolePage({ params }: DashboardRolePageProps) {
  if (!roles.includes(params.role as Role)) {
    notFound();
  }

  const role = params.role as Role;
  const cookieRole = cookies().get(ROLE_COOKIE)?.value as Role | undefined;

  if (!cookieRole) {
    redirect("/login");
  }

  if (cookieRole !== role) {
    redirect(`/dashboard/${cookieRole}`);
  }

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <RoleDashboard role={role} />
    </Suspense>
  );
}