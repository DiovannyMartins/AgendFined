import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { BlockForm, BlockRow } from "./block-form";

export default async function BloqueiosPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from("availability_blocks")
    .select("*")
    .eq("business_id", business?.id ?? "")
    .order("start_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Bloqueios</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Bloqueie períodos para pausas, férias e exceções. Os horários bloqueados não aparecem para reserva.
      </p>

      <div className="rounded-xl border border-border bg-card/40 p-4">
        <BlockForm />
      </div>

      {blocks && blocks.length > 0 && (
        <div className="mt-6 space-y-2">
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              id={block.id}
              startAt={block.start_at}
              endAt={block.end_at}
              reason={block.reason}
            />
          ))}
        </div>
      )}
    </div>
  );
}
