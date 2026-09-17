import { createAdminClient } from "@/lib/supabase/admin";
import { createMercadoPagoProvider } from "./mercado-pago";
import { reconcileBilling, type ReconciliationAttempt, type ReconciliationBusiness, type ReconciliationSubscription } from "./reconciliation";

export function gracePeriodForSnapshot(status: "pending" | "authorized" | "paused" | "cancelled", existing: string | null | undefined): string | null {
  return status === "authorized" ? null : (existing ?? null);
}

export async function runBoundedReconciliation() {
  const admin = createAdminClient();
  const { data: attempts, error: attemptsError } = await admin
    .from("billing_attempts")
    .select("id,business_id,status,provider_preapproval_id,expected_subscription_id,updated_at")
    .in("status", ["reserved", "creating", "unknown", "ambiguous"])
    .order("updated_at", { ascending: true })
    .limit(25);
  if (attemptsError) throw new Error("RECONCILIATION_ATTEMPTS_LOAD_FAILED");

  const batch = attempts ?? [];
  const businessIds = [...new Set(batch.map(row => row.business_id))];
  const providerIds = [...new Set(batch.flatMap(row => row.provider_preapproval_id ? [row.provider_preapproval_id] : []))];
  if (businessIds.length === 0) return [];

  const [{ data: businesses, error: businessesError }, { data: byBusiness, error: byBusinessError }, { data: byProvider, error: byProviderError }] = await Promise.all([
    admin.from("businesses").select("id,current_subscription_id,plan").in("id", businessIds),
    admin.from("subscriptions").select("id,business_id,mp_preapproval_id,status,grace_period_end").in("business_id", businessIds),
    providerIds.length > 0
      ? admin.from("subscriptions").select("id,business_id,mp_preapproval_id,status,grace_period_end").in("mp_preapproval_id", providerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const subscriptions = [...new Map([...(byBusiness ?? []), ...(byProvider ?? [])].map(row => [row.id, row])).values()];
  if (businessesError) throw new Error("RECONCILIATION_BUSINESSES_LOAD_FAILED");
  if (byBusinessError || byProviderError) throw new Error("RECONCILIATION_SUBSCRIPTIONS_LOAD_FAILED");

  const provider = createMercadoPagoProvider({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "" });
  return reconcileBilling({
    provider,
    attempts: (attempts ?? []).map(row => ({ id: row.id, businessId: row.business_id, status: row.status, providerPreapprovalId: row.provider_preapproval_id, expectedSubscriptionId: row.expected_subscription_id, updatedAt: row.updated_at })) as ReconciliationAttempt[],
    subscriptions: (subscriptions ?? []).map(row => ({ id: row.id, businessId: row.business_id, mpPreapprovalId: row.mp_preapproval_id, status: row.status, gracePeriodEnd: row.grace_period_end })) as ReconciliationSubscription[],
    businesses: (businesses ?? []).map(row => ({ id: row.id, currentSubscriptionId: row.current_subscription_id, plan: row.plan })) as ReconciliationBusiness[],
    claim: async (resourceKey, token) => {
      const { data, error } = await admin.rpc("claim_billing_reconciliation", { p_resource_key: resourceKey, p_claim_token: token, p_lease_seconds: 300 });
      if (error) throw new Error("RECONCILIATION_CLAIM_FAILED");
      return data;
    },
    release: async (resourceKey, token) => {
      const { error } = await admin.rpc("release_billing_reconciliation", { p_resource_key: resourceKey, p_claim_token: token });
      if (error) throw new Error("RECONCILIATION_RELEASE_FAILED");
    },
    markAttempt: async (attemptId, status, providerId, expectedStatus, claimToken) => {
      const { error } = await admin.rpc("mark_billing_attempt_reconciliation", { p_attempt_id: attemptId, p_claim_token: claimToken, p_expected_status: expectedStatus, p_new_status: status, p_provider_preapproval_id: providerId ?? null });
      if (error) throw new Error("RECONCILIATION_MARK_FAILED");
    },
    reconcileAttempt: async (attempt, snapshot, claimToken) => {
      const local = (subscriptions ?? []).find(row => row.mp_preapproval_id === snapshot.id);
      const gracePeriodEnd = gracePeriodForSnapshot(snapshot.status, local?.grace_period_end);
      const { error } = await admin.rpc("reconcile_billing_attempt_subscription", { p_attempt_id: attempt.id, p_mp_preapproval_id: snapshot.id, p_status: snapshot.status, p_current_period_start: snapshot.currentPeriodStart, p_current_period_end: snapshot.currentPeriodEnd, p_grace_period_end: gracePeriodEnd, p_claim_token: claimToken });
      if (error) throw new Error("RECONCILIATION_FINALIZE_FAILED");
    },
    applySnapshot: async () => undefined,
    report: async report => console.info(JSON.stringify({ event: "reconciliation_report", ...report })),
  });
}
