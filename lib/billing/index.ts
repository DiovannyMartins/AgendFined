// Public surface of the billing seam (ADR 0008). Consumers should import from
// here (or from the specific submodule) rather than the Mercado Pago
// implementation, which stays behind `BillingProvider` and is wired only by the
// server action (`actions.ts`).
export { getSubscription, fetchActiveGraceSubscription, fetchCurrentSubscription } from "./get-subscription";
export type { FetchGraceSubscription, FetchSubscription, GetSubscriptionResult } from "./get-subscription";
export { startUpgrade } from "./start-upgrade";
export type { SaveSubscription, StartUpgradeDeps, StartUpgradeResult } from "./start-upgrade";
export type { BillingPlan, BillingSubscription, SubscriptionStatus } from "./types";
export { isGraceActive, isSubscriptionInGrace } from "./types";
export type {
  BillingProvider,
  CreatePreapprovalInput,
  CreatePreapprovalResult,
  Preapproval,
} from "./provider";
export { handleWebhook } from "./handle-webhook";
export type {
  HandleWebhookDeps,
  HandleWebhookResult,
  PreapprovalResource,
  WebhookEvent,
} from "./handle-webhook";
export { PLAN_INFO } from "./plans";
export type { PlanInfo } from "./plans";
export { cancelSubscription } from "./cancel-subscription";
export type { CancelSubscriptionDeps, CancelSubscriptionResult } from "./cancel-subscription";
