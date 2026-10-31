// Server-side retrieval of the billing report (INC-2, Pro feature). It resolves
// the selected period and computes the report from the owner's own bookings,
// aggregated in the database (RLS scopes them), but only after the Pro gate
// passes: a Free business gets `upgrade_required` and never sees report data.
// The gate + math live in the pure module; this file is only the boundary that
// fetches. The deps are injectable so the boundary can be exercised with a real
// user-scoped client (RLS) in the integration tests.
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import {
  buildBillingReportResult,
  type BillingReportResult,
  type FetchReportGroups,
  type ReportBusiness,
} from "@/lib/reports/reports";

export type { BillingReportResult };

type GetBusiness = () => Promise<ReportBusiness | null>;

// Default fetch: counts and revenue grouped in the database (security invoker
// RPC, so RLS still scopes the rows), never cut at PostgREST's 1000 rows (#215).
// Throws so the core maps it to `{ status: "error" }`.
const fetchOwnerGroups: FetchReportGroups = async (businessId, range) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_report_groups", {
    p_business_id: businessId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
};

export async function getBillingReport(
  rangeKey?: string,
  deps?: { getBusiness?: GetBusiness; fetchGroups?: FetchReportGroups },
): Promise<BillingReportResult> {
  const getBusiness = deps?.getBusiness ?? getCurrentBusiness;
  const fetchGroups = deps?.fetchGroups ?? fetchOwnerGroups;
  const business = await getBusiness();
  return buildBillingReportResult(business, fetchGroups, rangeKey);
}
