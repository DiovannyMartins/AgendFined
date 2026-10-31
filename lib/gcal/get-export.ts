// Server-side retrieval of the owner's agenda export (Pro feature, ADR 0008). It
// resolves the current business and builds the importable .ics feed, but only
// after the Pro gate passes: a Free business gets `upgrade_required` and never
// sees the feed. The gate + serialisation live in the pure module; this file is
// only the boundary that fetches. The deps are injectable so the boundary can be
// exercised with a real user-scoped client (RLS) in the integration tests, and
// with the data the agenda page already loaded.
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import {
  buildGcalExportResult,
  type FetchGcalBookings,
  type GcalExportBooking,
  type GcalExportBusiness,
  type GcalExportResult,
} from "@/lib/gcal/export";

type GetBusiness = () => Promise<GcalExportBusiness | null>;

// Default bookings fetch: the owner's own rows, scoped by RLS. Only what the
// feed can carry (confirmed, ahead), so the past never eats PostgREST's
// 1000-row cap (#215). Throws so the core maps it to `{ status: "error" }`.
const fetchOwnerBookings: FetchGcalBookings = async (businessId) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, start_at, end_at, service_name_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_note")
    .eq("business_id", businessId)
    .eq("status", "confirmed")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GcalExportBooking[];
};

export async function getGcalExport(
  deps?: { getBusiness?: GetBusiness; fetchBookings?: FetchGcalBookings },
): Promise<GcalExportResult> {
  const getBusiness = deps?.getBusiness ?? getCurrentBusiness;
  const fetchBookings = deps?.fetchBookings ?? fetchOwnerBookings;
  const business = await getBusiness();
  return buildGcalExportResult(business, fetchBookings);
}
