import { redirect, notFound } from "next/navigation";
import { lazy, Suspense } from "react";
import type { Role } from "@/lib/models";
import { Skeleton } from "@/components/ui/skeleton";
import { requireServerSessionUser } from "@/lib/server-session";

const roles: Role[] = ["ceo", "cfo", "manager", "worker"];
const RoleDashboard = lazy(() => import("@/components/dashboard/role-dashboard").then((m) => ({ default: m.RoleDashboard })));

type DashboardRolePageProps = {
  params: { role: string };
};

export default async function DashboardRolePage({ params }: DashboardRolePageProps) {
  if (!roles.includes(params.role as Role)) {
    notFound();
  }

  const user = await requireServerSessionUser();
  const role = params.role as Role;

  if (user.role !== role) {
    redirect(`/dashboard/${user.role}`);
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