export type TurnstileAction = "booking_write" | "booking_consult";

type VerifyTurnstileOptions = {
  expectedAction: TurnstileAction;
  remoteIp?: string;
};

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function configuredHostname(): string | null {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return null;
  try {
    return new URL(configured).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Production is fail-closed for every missing or unverifiable binding. Local
// development and tests may omit Turnstile entirely, but a configured verifier
// always validates the token's action and hostname.
export async function verifyTurnstile(
  token: string | undefined,
  options: VerifyTurnstileOptions,
): Promise<{ ok: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const hostname = configuredHostname();
  const isProduction = process.env.NODE_ENV === "production";

  if (!secret || !siteKey || !hostname) {
    return { ok: !isProduction && !secret && !siteKey };
  }
  if (!token) return { ok: false };

  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteIp && options.remoteIp !== "unknown") body.set("remoteip", options.remoteIp);

  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
  } catch {
    return { ok: false };
  }

  if (!response.ok) return { ok: false };

  let data: TurnstileResponse;
  try {
    data = (await response.json()) as TurnstileResponse;
  } catch {
    return { ok: false };
  }

  return {
    ok:
      data.success === true &&
      data.action === options.expectedAction &&
      data.hostname?.toLowerCase() === hostname,
  };
}
