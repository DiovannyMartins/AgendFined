import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { formatServicePrice } from "@/lib/format/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { hasAccess } from "@/lib/plan/access";
import { SuspendedFieldset } from "@/components/suspended-fieldset";
import { ServiceForm } from "./service-form";
import { ServiceToggle } from "./service-toggle";
import { ServiceDelete } from "./service-delete";

export const metadata: Metadata = { title: "Serviços — AgendFined" };

export default async function ServicosPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", business?.id ?? "")
    .order("created_at", { ascending: true });

  const list = services ?? [];

  // Counted in the database: fetching the reservas to count them was cut at
  // PostgREST's 1000 rows (#215).
  const { data: counts } = await supabase.rpc("service_booking_counts", {
    p_business_id: business?.id ?? "",
  });

  const bookingCountByService = new Map<string, number>();
  const scheduledByService = new Map<string, number>();
  for (const row of counts ?? []) {
    bookingCountByService.set(row.service_id, Number(row.booking_count));
    if (Number(row.scheduled_count) > 0) {
      scheduledByService.set(row.service_id, Number(row.scheduled_count));
    }
  }

  return (
    // A suspended negócio (ADR 0013) sees its serviços but cannot change them.
    <SuspendedFieldset suspended={!!business && !hasAccess(business)} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Serviços</h1>
          <p className="mt-2 text-sm text-muted-foreground">Gerencie o que seu negócio oferece.</p>
        </div>
        <ServiceForm />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <CardTitle className="mt-3">Nenhum serviço ainda</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Cadastre seu primeiro serviço para começar a receber reservas.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((service) => (
            <div
              key={service.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{service.name}</p>
                  {!service.is_active && <Badge variant="secondary">Inativo</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {service.description || "Sem descrição"} · {service.duration_minutes} min ·{" "}
                  {formatServicePrice(service.price_cents)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ServiceToggle
                  id={service.id}
                  name={service.name}
                  isActive={service.is_active}
                  disabled={!!business && !hasAccess(business)}
                />
                <ServiceForm
                  service={{
                    id: service.id,
                    name: service.name,
                    description: service.description,
                    durationMinutes: service.duration_minutes,
                    priceCents: service.price_cents,
                  }}
                />
                <ServiceDelete
                  id={service.id}
                  name={service.name}
                  hasHistory={bookingCountByService.has(service.id)}
                  bookingCount={bookingCountByService.get(service.id) ?? 0}
                  hasScheduled={scheduledByService.has(service.id)}
                  scheduledCount={scheduledByService.get(service.id) ?? 0}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SuspendedFieldset>
  );
}
