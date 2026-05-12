import { redirect } from "next/navigation";
import { requireServerSessionUser } from "@/lib/server-session";

export default async function DashboardIndexPage() {
  const user = await requireServerSessionUser();
  redirect(`/dashboard/${user.role}`);
}