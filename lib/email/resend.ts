import "server-only";

// Shared delivery for transactional emails sent to the cliente. Sending is best
// effort: callers decide how to log a failure, and nothing here ever throws.
export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

// A short provider hiccup must not cost the cliente the only link to cancel
// (#187): temporary failures get two more attempts, all inside a budget that
// keeps the Server Action responsive.
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 5_000;
const TOTAL_BUDGET_MS = 10_000;
const MIN_ATTEMPT_MS = 1_000;
const RETRY_DELAYS_MS = [250, 750];

type AttemptOutcome = "sent" | "temporary" | "permanent";

export async function sendEmail(email: Email): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "not_configured" };

  const request: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // A timed-out attempt may still have been delivered; the same key makes
      // the provider drop the repeat instead of sending the e-mail twice.
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  };

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const outcome = await attemptDelivery(request, Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now()));
    if (outcome === "sent") return { sent: true };
    if (outcome === "permanent" || attempt === MAX_ATTEMPTS) break;

    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (deadline - Date.now() - delay < MIN_ATTEMPT_MS) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return { sent: false, reason: "provider_error" };
}

// Timeouts, network errors, 429 and 5xx may pass on their own, and so does 409:
// Resend sends it while a timed-out attempt with the same key is still being
// processed, and answers the repeat with that attempt's result. Any other
// refusal (validation, auth) would fail the same way again.
async function attemptDelivery(request: RequestInit, timeoutMs: number): Promise<AttemptOutcome> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      ...request,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return "sent";
    return [409, 429].includes(response.status) || response.status >= 500 ? "temporary" : "permanent";
  } catch {
    return "temporary";
  }
}
