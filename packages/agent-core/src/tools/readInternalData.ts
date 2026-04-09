import { createClient } from "@supabase/supabase-js";

type AllowedTable = "goals" | "tasks" | "reports";

const allowedTables = new Set<AllowedTable>(["goals", "tasks", "reports"]);

function getServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export async function readInternalData(
  table: AllowedTable,
  filters: Record<string, string>
): Promise<Record<string, unknown>[]> {
  if (!allowedTables.has(table)) {
    throw new Error(`Table ${table} is not allowed`);
  }

  const supabase = getServiceClient();

  let query = supabase.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed reading ${table}: ${error.message}`);
  }

  return (data ?? []) as Record<string, unknown>[];
}
