import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { splitBlocksByTime } from "@/lib/availability/blocks";
import { BlockForm, BlockRow } from "./block-form";

export const metadata: Metadata = { title: "Bloqueios — AgendFined" };

export default async function BloqueiosPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from("availability_blocks")
    .select("*")
    .eq("business_id", business?.id ?? "")
    .order("start_at", { ascending: true });
  const { current, past } = splitBlocksByTime(blocks ?? [], new Date());
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

      <div className="rounded-xl border border-border bg-card/40 p-4">
        <BlockForm timezone={business?.timezone} />
      </div>

      {current.length > 0 && <div className="mt-6 space-y-2">{current.map(renderRow)}</div>}

      {past.length > 0 && (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Encerrados</h2>
          {past.map(renderRow)}
        </section>
      )}
    </div>
  );
}
