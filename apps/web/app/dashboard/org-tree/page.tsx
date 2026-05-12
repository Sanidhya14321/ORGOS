import { OrgTree } from "@/components/tree/org-tree";
import { requireServerSessionUser } from "@/lib/server-session";

export default async function OrgTreePage() {
  await requireServerSessionUser();
  return <OrgTree />;
}
