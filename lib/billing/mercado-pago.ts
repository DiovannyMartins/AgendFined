// Mercado Pago provider implementation (ADR 0008). Behind the `BillingProvider`
// seam; nothing outside `lib/billing/` imports this directly. Creates a
// recurring preapproval (temporary R$ 1 test price, see SUBSCRIPTION_TERMS TODO)
// and returns its `init_point`. The access
// token is TEST-* in sandbox (dev) and APP_USR-* in production; the API base
// stays the same. `apiBaseUrl` is injectable so the unit tests can point at a
// stub server or stub `fetch` without a real network call.
import type { BillingPlan } from "./types";
import type {
  BillingProvider,
  CreatePreapprovalInput,
  CreatePreapprovalResult,
  Preapproval,
} from "./provider";

const CANCELLED = "cancelled";

const DEFAULT_API_BASE_URL = "https://api.mercadopago.com";
export const DEFAULT_GET_PREAPPROVAL_TIMEOUT_MS = 30_000;

export class MercadoPagoAmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoAmbiguousError";
  }
}

// The recurring subscription terms per plan. Only the PROFISSIONAL plan
// is sold as a subscription; a `free` plan has no preapproval, so it is rejected.
// TODO(test-price): amount is a temporary R$ 1 test price while validating the
// Mercado Pago checkout; revert to 19 (CONTEXT.md + ADR 0008) before launch.
const SUBSCRIPTION_TERMS: Record<BillingPlan, { amount: number; label: string } | null> = {
  free: null,
  pro: { amount: 1, label: "PROFISSIONAL" },
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
            reason: `Assinatura ${terms.label} - AgendFined (R$ ${terms.amount}/mês)`,
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
        res = await fetch(`${apiBaseUrl}/preapproval/${id}`, {
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
        auto_recurring?: { start_date?: string | null; end_date?: string | null };
      };
      const status = body.status;
      if (status !== "pending" && status !== "authorized" && status !== "paused" && status !== "cancelled") {
        throw new Error("Mercado Pago preapproval response missing a valid status");
      }
      return {
        id: body.id ?? id,
        status,
        externalReference: body.external_reference ?? null,
        currentPeriodStart: body.auto_recurring?.start_date ?? null,
        currentPeriodEnd: body.auto_recurring?.end_date ?? null,
      };
    },

    async cancelPreapproval(id: string): Promise<void> {
      const res = await fetch(`${apiBaseUrl}/preapproval/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ status: CANCELLED }),
      });

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
