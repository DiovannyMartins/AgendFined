// Mercado Pago provider implementation (ADR 0008). Behind the `BillingProvider`
// seam; nothing outside `lib/billing/` imports this directly. Creates a
// recurring preapproval using the server-only configured plan price.
// and returns its `init_point`. The access
// token is TEST-* in sandbox (dev) and APP_USR-* in production; the API base
// stays the same. `apiBaseUrl` is injectable so the unit tests can point at a
// stub server or stub `fetch` without a real network call.
import type { BillingPlan } from "./types";
import { getProPriceCents } from "@/lib/plan/catalog";
import type {
  BillingProvider,
  CreatePreapprovalInput,
  CreatePreapprovalResult,
  Preapproval,
} from "./provider";

const CANCELLED = "cancelled";

const DEFAULT_API_BASE_URL = "https://api.mercadopago.com";
export const DEFAULT_GET_PREAPPROVAL_TIMEOUT_MS = 30_000;
// The webhook and the reconciliation cron (60 s HTTP timeout) wait on these
// writes, so a stalled one gives up sooner than a read.
export const DEFAULT_UPDATE_PREAPPROVAL_TIMEOUT_MS = 10_000;

export class MercadoPagoAmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoAmbiguousError";
  }
}

// The recurring subscription terms per plan. Only the PROFISSIONAL plan
// is sold as a subscription; a `free` plan has no preapproval, so it is rejected.
const SUBSCRIPTION_TERMS: Record<BillingPlan, { amount: number; label: string } | null> = {
  free: null,
  pro: { amount: getProPriceCents() / 100, label: "PROFISSIONAL" },
};

export interface MercadoPagoConfig {
  accessToken: string;
  apiBaseUrl?: string;
}

// Shared error handling for a non-ok Mercado Pago response: read the optional
// `message` from a JSON body and throw a single, consistent error shape.
async function assertOk(res: Response, operation: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    const err = (await res.json()) as { message?: string };
    detail = err?.message ?? "";
  } catch {
    // Non-JSON error body; the status is enough.
  }
  throw new Error(`Mercado Pago ${operation} failed (${res.status})${detail ? `: ${detail}` : ""}`);
}

// A `PUT /preapproval/{id}` that gives up after the update timeout. A response
// that never arrives (timeout or network failure) is ambiguous: Mercado Pago
// may have applied the change.
async function putPreapproval(url: string, accessToken: string, body: unknown, operation: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Mercado Pago ${operation} timed out`)),
    DEFAULT_UPDATE_PREAPPROVAL_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new MercadoPagoAmbiguousError(
      error instanceof Error ? error.message : `Mercado Pago ${operation} response was not received`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// The provider's `last_modified`, as an ISO instant, or null when absent or
// unreadable. It versions the snapshot so an older read is never applied over
// a newer one (apply_subscription_snapshot).
function providerTimestamp(value: string | null | undefined): string | null {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function createMercadoPagoProvider(config: MercadoPagoConfig): BillingProvider {
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  return {
    async createPreapproval(input: CreatePreapprovalInput): Promise<CreatePreapprovalResult> {
      const terms = SUBSCRIPTION_TERMS[input.plan];
      if (!terms) {
        throw new Error(`Mercado Pago does not sell a subscription for the ${input.plan} plan`);
      }

      let res: Response;
      try {
        res = await fetch(`${apiBaseUrl}/preapproval`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            reason: `Assinatura ${terms.label} - AgendFined (R$ ${terms.amount.toFixed(2).replace(".", ",")}/mês)`,
            auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: terms.amount,
              currency_id: "BRL",
            },
            // The checkout collects the payment method after this request.
            // Mercado Pago requires an explicit pending status for a
            // preapproval created without a card_token_id.
            status: "pending",
            back_url: input.backUrl,
            external_reference: input.externalReference,
            ...(input.payerEmail ? { payer_email: input.payerEmail } : {}),
            ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
          }),
        });
      } catch (error) {
        throw new MercadoPagoAmbiguousError(
          error instanceof Error ? error.message : "Mercado Pago preapproval response was not received",
        );
      }

      await assertOk(res, "preapproval");

      let body: { id?: string; init_point?: string; sandbox_init_point?: string };
      try {
        body = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
      } catch (error) {
        throw new MercadoPagoAmbiguousError(
          error instanceof Error ? error.message : "Mercado Pago preapproval response was not readable",
        );
      }
      const preapprovalId = body.id ?? "";
      // Test preapprovals must be opened in Mercado Pago's sandbox. The
      // production init_point can be returned alongside sandbox_init_point,
      // but it does not resolve the TEST-* preapproval and shows a 404 page.
      const initPoint = config.accessToken.startsWith("TEST-")
        ? (body.sandbox_init_point ?? "")
        : (body.init_point ?? "");
      if (!preapprovalId || !initPoint) {
        throw new MercadoPagoAmbiguousError("Mercado Pago preapproval response missing id/init_point");
      }
      return { preapprovalId, initPoint };
    },

    async getPreapproval(id: string, options = {}): Promise<Preapproval> {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("Mercado Pago preapproval fetch timed out")),
        options.timeoutMs ?? DEFAULT_GET_PREAPPROVAL_TIMEOUT_MS,
      );
      let res: Response;
      try {
        res = await fetch(`${apiBaseUrl}/preapproval/${encodeURIComponent(id)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      await assertOk(res, "preapproval fetch");

      const body = (await res.json()) as {
        id?: string;
        status?: string;
        external_reference?: string | null;
        next_payment_date?: string | null;
        last_modified?: string | null;
        auto_recurring?: {
          start_date?: string | null;
          transaction_amount?: number | null;
          currency_id?: string | null;
          frequency?: number | null;
          frequency_type?: string | null;
        };
      };
      // Every caller applies this snapshot to the preapproval it asked for, so a
      // response about any other one (or none) must never be used.
      if (body.id !== id) {
        throw new Error("Mercado Pago preapproval response does not match the requested id");
      }
      const status = body.status;
      if (status !== "pending" && status !== "authorized" && status !== "paused" && status !== "cancelled") {
        throw new Error("Mercado Pago preapproval response missing a valid status");
      }
      return {
        id,
        status,
        externalReference: body.external_reference ?? null,
        currentPeriodStart: body.auto_recurring?.start_date ?? null,
        // The paid period ends on the next charge. `auto_recurring.end_date` is
        // the end of the whole assinatura and is absent when it has no final
        // date, which is how the PROFISSIONAL is sold (issue #142).
        currentPeriodEnd: body.next_payment_date ?? null,
        transactionAmount:
          typeof body.auto_recurring?.transaction_amount === "number" ? body.auto_recurring.transaction_amount : null,
        currencyId: body.auto_recurring?.currency_id ?? null,
        frequency: typeof body.auto_recurring?.frequency === "number" ? body.auto_recurring.frequency : null,
        frequencyType: body.auto_recurring?.frequency_type ?? null,
        lastModified: providerTimestamp(body.last_modified),
      };
    },

    async updatePreapprovalAmount(id: string, amountCents: number): Promise<void> {
      const res = await putPreapproval(
        `${apiBaseUrl}/preapproval/${encodeURIComponent(id)}`,
        config.accessToken,
        { auto_recurring: { transaction_amount: amountCents / 100, currency_id: "BRL" } },
        "preapproval amount update",
      );

      await assertOk(res, "preapproval amount update");
    },

    async cancelPreapproval(id: string): Promise<void> {
      const res = await putPreapproval(
        `${apiBaseUrl}/preapproval/${encodeURIComponent(id)}`,
        config.accessToken,
        { status: CANCELLED },
        "preapproval cancel",
      );

      if (res.ok) return;

      // The PUT can fail with 400 "You can not modify a cancelled preapproval"
      // when the provider already has the preapproval cancelled but our local
      // subscription row still says `authorized` (e.g. a cancel webhook that was
      // never applied). Cancelling is idempotent: reconcile with the provider's
      // ground truth and treat an already-cancelled preapproval as a successful
      // cancel, otherwise surface the original error.
      try {
        const current = await this.getPreapproval(id);
        if (current.status === "cancelled") return;
      } catch {
        // A failed reconciliation is not a success; fall through and surface the
        // original PUT error.
      }

      await assertOk(res, "preapproval cancel");
    },
  };
}
