import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON;

  if (!url || !anon) {
    throw new Error(
      "Missing Supabase client env. In repo root .env.local set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON (or SUPABASE_URL + SUPABASE_ANON_KEY), then restart the web dev server."
    );
  }

  return createClient(url, anon);
}
