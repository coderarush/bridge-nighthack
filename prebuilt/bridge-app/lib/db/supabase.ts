import { createClient } from "@supabase/supabase-js";

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  );
}

// Server client. Prefers the service secret key; falls back to the publishable
// key (RLS is disabled for the demo) so the app runs with just URL + publishable key.
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key, {
    auth: { persistSession: false },
  });
}
