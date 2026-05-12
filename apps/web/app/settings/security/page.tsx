import { requireServerSessionUser } from "@/lib/server-session";
import { SecuritySettingsClient } from "./security-settings-client";

export default async function SecuritySettingsPage() {
  await requireServerSessionUser();
  return <SecuritySettingsClient />;
}