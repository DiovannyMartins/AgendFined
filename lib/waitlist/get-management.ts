// Server-side retrieval of the owner's waitlist management view (issue #22, ADR
// 0008). It resolves the current business and builds the list of waitlist entries
// the dashboard renders, but only after the Pro gate passes: a Free business gets
// `upgrade_required` and never sees its waitlist. The gate + mapping live in the
// pure module; this file is only the boundary that fetches. The deps are
// injectable so the boundary can be exercised with a real user-scoped client
// (RLS) in the integration tests.
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import {
  buildWaitlistManagementResult,
  type FetchWaitlistEntries,
  type ManageWaitlistEntry,
  type WaitlistManagementBusiness,
  type WaitlistManagementResult,
} from "@/lib/waitlist/manage";
import type { WaitlistStatus } from "@/lib/waitlist/waitlist";
import { scoreWaitlistPriority } from "@/lib/typesafe/judgments";

type GetBusiness = () => Promise<WaitlistManagementBusiness | null>;

// Default entries fetch: the owner's own rows, scoped by RLS. The service name is
// resolved from the owner's own services so the dashboard can render the service
// column without exposing another business's catalog. Throws on error so the core
// maps it to `{ status: "error" }` (a failed read must never look like an empty
// list).
const fetchOwnerEntries: FetchWaitlistEntries = async (businessId) => {
  const supabase = await createClient();
  const [entriesRes, servicesRes] = await Promise.all([
    supabase
      .from("waitlist_entries")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase.from("services").select("id, name").eq("business_id", businessId),
  ]);
  if (entriesRes.error) throw new Error(entriesRes.error.message);
  if (servicesRes.error) throw new Error(servicesRes.error.message);

  const serviceNames = new Map((servicesRes.data ?? []).map((s) => [s.id, s.name]));
  return (entriesRes.data ?? []).map((e) => ({
    ...e,
    service_name: serviceNames.get(e.service_id) ?? "Serviço",
    status: e.status as WaitlistStatus,
  })) as ManageWaitlistEntry[];
};

export async function getWaitlistManagement(
  deps?: { getBusiness?: GetBusiness; fetchEntries?: FetchWaitlistEntries },
): Promise<WaitlistManagementResult> {
  const getBusiness = deps?.getBusiness ?? getCurrentBusiness;
  const fetchEntries = deps?.fetchEntries ?? fetchOwnerEntries;
  const business = await getBusiness();
  const result = await buildWaitlistManagementResult(business, fetchEntries);
  if (result.status !== "ok") return result;

  const priority = await scoreWaitlistPriority(
    result.entries.map((entry) => ({
      id: entry.id,
      serviceName: entry.service_name,
      startAt: entry.start_at,
      createdAt: entry.created_at,
      status: entry.status,
    })),
  );
  if (priority.size === 0) return result;

  const entries = result.entries
    .map((entry) => {
      const judgment = priority.get(entry.id);
      return judgment && judgment.confidence >= 0.7
        ? { ...entry, priority_score: judgment.score, priority_confidence: judgment.confidence }
        : entry;
    })
    .sort((a, b) => {
      const scoreDifference = (b.priority_score ?? -1) - (a.priority_score ?? -1);
      return scoreDifference || a.created_at.localeCompare(b.created_at);
    });

  return { status: "ok", entries };
}
