import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";

export default function DashboardIndexPage() {
  const role = cookies().get(ROLE_COOKIE)?.value as Role | undefined;

  if (!role) {
    redirect("/login");
  }

  redirect(`/dashboard/${role}`);
}