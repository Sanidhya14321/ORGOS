/**
 * Org hierarchy helpers for goal proposals and escalation.
 * Data model: `users.reports_to`, `positions` per org — treat as directed graph in Postgres.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Pick first CEO/CFO in the management chain starting at `creatorId` (inclusive). */
export async function resolveProposalReviewerId(
  supabase: SupabaseClient,
  creatorId: string
): Promise<string | null> {
  const seen = new Set<string>();
  let cursor: string | null = creatorId;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = await supabase.from("users").select("reports_to, role").eq("id", cursor).maybeSingle();
    if (row.error || !row.data) {
      return null;
    }
    const rowData = row.data as { reports_to: string | null; role: string | null };
    const role = typeof rowData.role === "string" ? rowData.role : "";
    if (role === "ceo" || role === "cfo") {
      return cursor;
    }
    cursor = typeof rowData.reports_to === "string" ? rowData.reports_to : null;
  }

  return null;
}
