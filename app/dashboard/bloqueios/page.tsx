import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { splitBlocksByTime } from "@/lib/availability/blocks";
import { hasAccess } from "@/lib/plan/access";
import { SuspendedFieldset } from "@/components/suspended-fieldset";
import { BlockForm, BlockRow } from "./block-form";

export const metadata: Metadata = { title: "Bloqueios — AgendFined" };

const PAST_BLOCKS_DAYS = 90;

export default async function BloqueiosPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const now = new Date();
  // Every bloqueio still ahead plus a slice of the encerrados, never the whole
  // history (#215).
  const pastCutoff = new Date(now.getTime() - PAST_BLOCKS_DAYS * 86_400_000).toISOString();
  const { data: blocks } = await supabase
    .from("availability_blocks")
    .select("id, start_at, end_at, reason")
    .eq("business_id", business?.id ?? "")
    .gte("end_at", pastCutoff)
    .order("start_at", { ascending: true })
    .limit(500);
  const { current, past } = splitBlocksByTime(blocks ?? [], now);
  const renderRow = (block: (typeof current)[number]) => (
    <BlockRow
      key={block.id}
      id={block.id}
      startAt={block.start_at}
      endAt={block.end_at}
      reason={block.reason}
      timezone={business?.timezone}
    />
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Bloqueios</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Bloqueie períodos para pausas, férias e exceções. Os horários bloqueados não aparecem para reserva.
      </p>

      {/* A suspended negócio (ADR 0013) sees its bloqueios but cannot change them. */}
      <SuspendedFieldset suspended={!!business && !hasAccess(business)} className="space-y-6">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <BlockForm timezone={business?.timezone} />
        </div>

        {current.length > 0 && <div className="mt-6 space-y-2">{current.map(renderRow)}</div>}
      </SuspendedFieldset>

      {past.length > 0 && (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Encerrados nos últimos {PAST_BLOCKS_DAYS} dias</h2>
          {past.map(renderRow)}
        </section>
      )}
    </div>
  );
}
