// Limits on the checkouts an owner can start (upgrade or retry). Each one costs
// a Mercado Pago call made with the AgendFined credential and leaves a pending
// assinatura that the webhook cleanup (once one is paid) and the repricing cron
// walk through. Both actions check them before reserving the attempt.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database-types";

// Pending checkouts only go away when one is paid (the webhook cancels the
// others) or when they are cancelled by hand.
export const MAX_PENDING_CHECKOUTS = 5;

export interface CheckoutLimits {
  // The negócio's `pending` assinaturas, current or not.
  countPendingCheckouts: () => Promise<number>;
  // Counts one checkout against the negócio's rate limit; false when exhausted.
  consumeCheckout: () => Promise<boolean>;
}

export type CheckoutLimitRefusal = {
  ok: false;
  code: "TOO_MANY_PENDING_CHECKOUTS" | "CHECKOUT_RATE_LIMITED" | "CHECKOUT_LIMIT_UNAVAILABLE";
  message: string;
};

// Fails closed: limits that cannot be checked refuse the checkout.
export async function refuseCheckoutOverLimits(limits: CheckoutLimits): Promise<CheckoutLimitRefusal | null> {
  try {
    return await checkLimits(limits);
  } catch {
    return {
      ok: false,
      code: "CHECKOUT_LIMIT_UNAVAILABLE",
      message: "Não foi possível iniciar a operação de pagamento. Tente novamente.",
    };
  }
}

async function checkLimits(limits: CheckoutLimits): Promise<CheckoutLimitRefusal | null> {
  // Checked first, so a refused click does not spend the rate limit.
  if ((await limits.countPendingCheckouts()) >= MAX_PENDING_CHECKOUTS) {
    return {
      ok: false,
      code: "TOO_MANY_PENDING_CHECKOUTS",
      message: "Você já gerou muitos links de pagamento sem concluir. Conclua um deles ou fale com o suporte para gerar um novo.",
    };
  }
  if (!(await limits.consumeCheckout())) {
    return {
      ok: false,
      code: "CHECKOUT_RATE_LIMITED",
      message: "Muitas tentativas de pagamento em pouco tempo. Aguarde alguns minutos e tente novamente.",
    };
  }
  return null;
}

// The negócio's `pending` assinaturas, current or not.
export async function countPendingCheckouts(client: SupabaseClient<Database>, businessId: string): Promise<number> {
  const { count, error } = await client
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
