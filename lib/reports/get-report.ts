// Server-side retrieval of the billing report (INC-2, Pro feature). It resolves
// the selected period and computes the report from the owner's own bookings (RLS
// scopes them), but only after the Pro gate passes: a Free business gets
// `upgrade_required` and never sees report data. The gate + math live in the
// pure module; this file is only the boundary that fetches. The deps are
// injectable so the boundary can be exercised with a real user-scoped client
// (RLS) in the integration tests.
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import {
  buildBillingReportResult,
  type BillingReportResult,
  type FetchReportBookings,
  type ReportBooking,
  type ReportBusiness,
} from "@/lib/reports/reports";

export type { BillingReportResult };

type GetBusiness = () => Promise<ReportBusiness | null>;

// Default bookings fetch: the owner's own rows, scoped by RLS. Throws so the
// core maps it to `{ status: "error" }`.
const fetchOwnerBookings: FetchReportBookings = async (businessId, range) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, start_at, price_cents_snapshot, service_name_snapshot")
    .eq("business_id", businessId)
    .gte("start_at", range.from)
    .lt("start_at", range.to);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReportBooking[];
};

export async function getBillingReport(
  rangeKey?: string,
  deps?: { getBusiness?: GetBusiness; fetchBookings?: FetchReportBookings },
): Promise<BillingReportResult> {
  const getBusiness = deps?.getBusiness ?? getCurrentBusiness;
  const fetchBookings = deps?.fetchBookings ?? fetchOwnerBookings;
  const business = await getBusiness();
  return buildBillingReportResult(business, fetchBookings, rangeKey);
}
