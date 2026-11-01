// Shared access-gate orchestration (ADR 0013). Every gated read (reports,
// waitlist management, calendar export) funnels through `runAccessGated`, so the
// fail-closed gate decision and the `{ id, has_access? }` business shape live
// in one place instead of being re-implemented per module. The fetch is
// injected so the gate is unit-testable without a database; the caller maps
// the `data` into its own success payload.
import { assertAccess } from "./access";

export type GatedBusiness = { id: string; has_access?: boolean | null };

export type GatedStatus = "no_business" | "error" | "access_required";

export type GatedResult<T> = { status: "ok"; data: T } | { status: GatedStatus };

export async function runAccessGated<T>(
  business: GatedBusiness | null,
  fetch: (businessId: string) => Promise<T>,
): Promise<GatedResult<T>> {
  if (!business) return { status: "no_business" };

  const gate = assertAccess(business);
  if (!gate.ok) return { status: "access_required" };

  try {
    const data = await fetch(business.id);
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}
