// The keys of the marketing plan cards (`PLAN_INFO`, `lib/plan/catalog.ts`).
// Not a database value: `businesses.plan` and the `business_plan` enum left the
// database in #261 (fase 4), and access comes from `business_has_access()`
// (ADR 0013, `lib/plan/access.ts`). The cards become one in fase 6, and this
// type goes with them.
export type Plan = "free" | "pro";
