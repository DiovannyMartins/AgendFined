import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database-types";
import { decideIntegrationWrites } from "../support/remote-write-guard";

// CI has no .env.local; the local stack's keys come from test-integration-local.
if (existsSync(".env.local")) loadEnvFile(".env.local");

// Every integration file imports this module, so refusing here stops the suite
// before it writes to a remote project (use `npm run test:integration:local`).
const target = decideIntegrationWrites(process.env);
if (!target.allowed) throw new Error(`Integração recusada: ${target.reason}`);

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// A business inserted with the service role keeps an explicit trial_ends_at
// and skips the trial registry (#261). Suites reuse telefones, so the ones that
// book through the public RPCs set this to keep access on every run.
export const ACTIVE_TRIAL_ENDS_AT = "2999-12-31T00:00:00Z";

// Retry a business upsert/insert on the transient `businesses_owner_id_fkey` FK
// race (23503) that can appear when integration files run against the shared
// remote project. Production constraints are untouched.
export async function retryOnFk<T>(fn: () => Promise<T>, attempts = 6, delayMs = 250): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as { message?: unknown })?.message ?? e);
      if (!/businesses_owner_id_fkey|23503/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// A publishable-key client with no session, used to exercise RLS/ACL as the
// anonymous (anon) role.
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE);
}

// Sign in using the anon-key client and return a session-scoped client used to
// exercise RLS as a real authenticated user.
export async function anonClientForUser(email: string, password: string) {
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

// Confirms the TOTP code the way verifyTotp does: the app registers the
// challenge it created before verifying, and only then does the database
// accept the session's aal2 (GHSA-vjcg).
export async function verifyTotpThroughApp(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  factorId: string,
  code: string,
) {
  const { data: claims, error: claimsError } = await client.auth.getClaims();
  if (claimsError || !claims) throw claimsError ?? new Error("no claims");
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw challenge.error;
  const granted = await admin.rpc("grant_mfa_challenge", {
    p_user_id: claims.claims.sub,
    p_session_id: String(claims.claims.session_id),
    p_challenge_id: challenge.data.id,
  });
  if (granted.error) throw granted.error;
  if (granted.data !== true) throw new Error("grant_mfa_challenge refused");
  return client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
}
