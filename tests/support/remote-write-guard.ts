// Guard for tests that write to a real (remote) Supabase project.
//
// Writing is refused unless BOTH conditions hold:
//   1. ALLOW_REMOTE_E2E_WRITES is exactly "true";
//   2. the host of NEXT_PUBLIC_SUPABASE_URL is listed in
//      E2E_ALLOWED_SUPABASE_HOSTS (comma-separated, e.g. "abcd.supabase.co").
// Optionally, E2E_FORBIDDEN_SUPABASE_HOSTS lists hosts (e.g. production) that
// are always refused, even if also allow-listed by mistake.
// The function never returns or logs credentials.

export type RemoteWriteDecision =
  | { allowed: true; host: string }
  | { allowed: false; reason: string };

type Env = Record<string, string | undefined>;

function hostList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function decideRemoteWrites(env: Env): RemoteWriteDecision {
  if (env.ALLOW_REMOTE_E2E_WRITES !== "true") {
    return { allowed: false, reason: "ALLOW_REMOTE_E2E_WRITES não é \"true\"; escrita remota recusada." };
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: false, reason: "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." };
  }

  let host: string;
  try {
    host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host.toLowerCase();
  } catch {
    return { allowed: false, reason: "NEXT_PUBLIC_SUPABASE_URL inválida." };
  }

  if (hostList(env.E2E_FORBIDDEN_SUPABASE_HOSTS).includes(host)) {
    return { allowed: false, reason: `O host ${host} está em E2E_FORBIDDEN_SUPABASE_HOSTS.` };
  }
  if (!hostList(env.E2E_ALLOWED_SUPABASE_HOSTS).includes(host)) {
    return { allowed: false, reason: `O host ${host} não está em E2E_ALLOWED_SUPABASE_HOSTS.` };
  }
  return { allowed: true, host };
}

// Calendar date (YYYY-MM-DD) `days` after now, in the given IANA time zone.
// Independent of the machine's local time zone.
export function dateInTimeZone(timeZone: string, days: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}
