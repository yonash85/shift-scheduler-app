import { createClient } from "@supabase/supabase-js";

// Server-only client using the service-role key. Never import this from a
// "use client" component — the key must never reach the browser bundle.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
