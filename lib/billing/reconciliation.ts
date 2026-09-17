import type { BillingProvider, Preapproval } from "./provider";
import { DEFAULT_GET_PREAPPROVAL_TIMEOUT_MS } from "./mercado-pago";

export type ReconciliationAttemptStatus = "reserved" | "creating" | "unknown" | "ambiguous" | "linked" | "failed";

export interface ReconciliationAttempt {
  id: string;
  businessId: string;
  status: ReconciliationAttemptStatus;
  providerPreapprovalId: string | null;
  expectedSubscriptionId: string | null;
  updatedAt: string;
}

export interface ReconciliationSubscription {
  id: string;
  businessId: string;
  mpPreapprovalId: string;
  status: Preapproval["status"];
  gracePeriodEnd?: string | null;
}

export interface ReconciliationBusiness {
  id: string;
  currentSubscriptionId: string | null;
  plan: "free" | "pro";
}

export interface ReconciliationReport {
  kind:
    | "stale_attempt"
    | "provider_error"
    | "provider_not_found"
    | "ambiguous_provider_match"
    | "orphan_provider_preapproval"
    | "duplicate_provider_link"
    | "business_invariant"
    | "search_unavailable";
  resourceId: string;
  detail: string;
}

export interface BillingReconciliationDependencies {
  provider: BillingProvider & {
    searchPreapprovals?: () => Promise<Preapproval[]>;
  };
  attempts: ReconciliationAttempt[];
  subscriptions: ReconciliationSubscription[];
  businesses: ReconciliationBusiness[];
  claim(resourceKey: string, token: string): Promise<boolean>;
  release(resourceKey: string, token: string): Promise<void>;
  markAttempt(attemptId: string, status: "unknown" | "ambiguous", providerId: string | undefined, expectedStatus: ReconciliationAttemptStatus, claimToken: string): Promise<void>;
  reconcileAttempt(attempt: ReconciliationAttempt, snapshot: Preapproval, claimToken: string): Promise<void>;
  applySnapshot(subscription: ReconciliationSubscription, snapshot: Preapproval): Promise<void>;
  report(report: ReconciliationReport): Promise<void>;
  now?: () => Date;
  staleAfterMs?: number;
  maxAttempts?: number;
  executionBudgetMs?: number;
  safetyMarginMs?: number;
  getTimeoutMs?: number;
  log?: (event: string, fields: Record<string, unknown>) => void;
}

function isStale(attempt: ReconciliationAttempt, now: Date, staleAfterMs: number): boolean {
  return (attempt.status === "reserved" || attempt.status === "creating") &&
    now.getTime() - new Date(attempt.updatedAt).getTime() >= staleAfterMs;
}

function providerNotFound(error: unknown): boolean {
  return error instanceof Error && /\(404\)|not found/i.test(error.message);
}

/**
 * Reconcile provider ground truth. Claims are acquired and released around
 * each unit of work; the implementation must never hold a PostgreSQL lock
 * while getPreapproval/searchPreapprovals is running.
 */
export async function reconcileBilling(deps: BillingReconciliationDependencies): Promise<ReconciliationReport[]> {
  const reports: ReconciliationReport[] = [];
  const emit = async (report: ReconciliationReport) => { reports.push(report); await deps.report(report); };
  const log = deps.log ?? ((event, fields) => console.info(JSON.stringify({ event, ...fields })));
  const startedAt = Date.now();
  const maxAttempts = deps.maxAttempts ?? 25;
  const executionBudgetMs = deps.executionBudgetMs ?? 240_000;
  const safetyMarginMs = deps.safetyMarginMs ?? 30_000;
  const getTimeoutMs = deps.getTimeoutMs ?? DEFAULT_GET_PREAPPROVAL_TIMEOUT_MS;
  const hasTime = () => Date.now() - startedAt + safetyMarginMs < executionBudgetMs;
  let processed = 0;
  let skipped = 0;
  log("execution_started", { maxAttempts, executionBudgetMs, safetyMarginMs, getTimeoutMs });
  const now = (deps.now ?? (() => new Date()))();
  const staleAfterMs = deps.staleAfterMs ?? 15 * 60 * 1000;
  const token = `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
  const localByProvider = new Map<string, ReconciliationSubscription[]>();
  for (const subscription of deps.subscriptions) {
    const rows = localByProvider.get(subscription.mpPreapprovalId) ?? [];
    rows.push(subscription); localByProvider.set(subscription.mpPreapprovalId, rows);
    if (rows.length > 1) await emit({ kind: "duplicate_provider_link", resourceId: subscription.mpPreapprovalId, detail: "multiple local subscriptions reference one preapproval" });
  }
  for (const business of deps.businesses) {
    if (business.currentSubscriptionId && !deps.subscriptions.some(s => s.id === business.currentSubscriptionId && s.businessId === business.id)) {
      await emit({ kind: "business_invariant", resourceId: business.id, detail: "current_subscription_id does not reference a subscription of the business" });
    }
  }

  const candidates = deps.attempts
    .filter(attempt => attempt.status === "unknown" || attempt.status === "ambiguous" || isStale(attempt, now, staleAfterMs))
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .slice(0, maxAttempts);
  skipped += Math.max(0, deps.attempts.filter(attempt => attempt.status === "unknown" || attempt.status === "ambiguous" || isStale(attempt, now, staleAfterMs)).length - candidates.length);

  for (const attempt of candidates) {
    if (!hasTime()) { skipped += candidates.length - processed; break; }
    processed += 1;
    if (!(attempt.status === "unknown" || attempt.status === "ambiguous" || isStale(attempt, now, staleAfterMs))) continue;
    const key = `billing-attempt/${attempt.id}`;
    if (!(await deps.claim(key, token))) { skipped += 1; log("attempt_skipped", { attemptId: attempt.id, reason: "claim_unavailable" }); continue; }
    log("attempt_claimed", { attemptId: attempt.id });
    try {
      if (isStale(attempt, now, staleAfterMs)) {
        await emit({ kind: "stale_attempt", resourceId: attempt.id, detail: `stale ${attempt.status} attempt; no automatic new creation is allowed` });
        await deps.markAttempt(attempt.id, attempt.status === "reserved" ? "ambiguous" : "unknown", undefined, attempt.status, token);
      }
      let providerId = attempt.providerPreapprovalId;
      if (!providerId) {
        if (!deps.provider.searchPreapprovals) {
          await deps.markAttempt(attempt.id, "ambiguous", undefined, attempt.status, token);
          await emit({ kind: "search_unavailable", resourceId: attempt.id, detail: "provider id is absent and deterministic provider search is unavailable" });
          continue;
        }
        let results: Preapproval[];
        try { results = await deps.provider.searchPreapprovals(); }
        catch (error) {
          await emit({ kind: "provider_error", resourceId: attempt.id, detail: error instanceof Error ? error.message : "provider search failed" });
          continue;
        }
        const matches = results.filter(p => p.externalReference === attempt.id);
        if (matches.length !== 1) {
          await deps.markAttempt(attempt.id, "ambiguous", undefined, attempt.status, token);
          await emit({ kind: "ambiguous_provider_match", resourceId: attempt.id, detail: `${matches.length} exact external_reference matches` });
          continue;
        }
        providerId = matches[0].id;
      }
      const duplicateLocalLinks = localByProvider.get(providerId) ?? [];
      if (duplicateLocalLinks.length > 1) {
        await emit({ kind: "duplicate_provider_link", resourceId: providerId, detail: "multiple local subscriptions reference one preapproval" });
        continue;
      }
      let snapshot: Preapproval;
      try {
        log("provider_fetch_started", { attemptId: attempt.id, providerId });
        snapshot = await deps.provider.getPreapproval(providerId, { timeoutMs: getTimeoutMs });
        log("provider_fetch_succeeded", { attemptId: attempt.id, providerId });
      }
      catch (error) {
        const detail = error instanceof Error ? error.message : "provider snapshot could not be obtained";
        log("provider_fetch_failed", { attemptId: attempt.id, providerId, timeout: /timed out|abort/i.test(detail), detail });
        await emit({ kind: providerNotFound(error) ? "provider_not_found" : "provider_error", resourceId: providerId, detail });
        continue;
      }
      const local = localByProvider.get(providerId) ?? [];
      if (local.some(s => s.businessId !== attempt.businessId)) {
        await deps.markAttempt(attempt.id, "ambiguous", providerId, attempt.status, token);
        await emit({ kind: "ambiguous_provider_match", resourceId: providerId, detail: "provider id is linked to another business" });
        continue;
      }
      if (snapshot.externalReference && snapshot.externalReference !== attempt.id) {
        await deps.markAttempt(attempt.id, "ambiguous", providerId, attempt.status, token);
        await emit({ kind: "ambiguous_provider_match", resourceId: providerId, detail: "external_reference is incompatible with the attempt" });
        continue;
      }
      if (!(await deps.claim(key, token))) {
        skipped += 1;
        log("claim_lost", { attemptId: attempt.id });
        await emit({ kind: "provider_error", resourceId: attempt.id, detail: "CLAIM_LOST" });
        continue;
      }
      await deps.reconcileAttempt(attempt, snapshot, token);
      log("reconciled", { attemptId: attempt.id });
    } catch (error) {
      log("attempt_failed", { attemptId: attempt.id, detail: error instanceof Error ? error.message : "unknown error" });
    } finally { await deps.release(key, token); }
  }

  if (deps.provider.searchPreapprovals) {
    let external: Preapproval[];
    try { external = await deps.provider.searchPreapprovals(); }
    catch (error) {
      await emit({ kind: "provider_error", resourceId: "preapproval-search", detail: error instanceof Error ? error.message : "provider search failed" });
      return reports;
    }
    for (const snapshot of external) {
      if (!(localByProvider.get(snapshot.id)?.length)) {
        await emit({ kind: "orphan_provider_preapproval", resourceId: snapshot.id, detail: "provider preapproval has no local subscription; no automatic cancellation" });
      }
    }
  }
  log("execution_finished", { processed, skipped, reportCount: reports.length, durationMs: Date.now() - startedAt });
  return reports;
}
