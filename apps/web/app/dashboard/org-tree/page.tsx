import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OrgTree } from "@/components/tree/org-tree";
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

  return <OrgTree />;
}
