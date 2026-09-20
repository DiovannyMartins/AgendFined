import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database-types";

// Server-only by module placement/import discipline. Never export this module
// to the browser and never prefix the service-role key with NEXT_PUBLIC_.
// Used only by the server for the public booking flow and privileged operations.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error("Supabase admin credentials are required on the server.");

  return createSupabaseClient<Database>(
    url,
    serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
