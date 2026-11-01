// `businesses.plan` (free | pro) still exists in the database until the billing
// work of #261 (fase 4) removes it together with the `business_plan` enum. It is
// no longer the seat of any gate nor of the janela: access comes from
// `business_has_access()` (ADR 0013, `lib/plan/access.ts`). Only the billing
// module and the marketing catalog still read this type.
export type Plan = "free" | "pro";
