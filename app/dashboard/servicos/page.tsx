import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { ServiceForm } from "./service-form";
import { ServiceToggle } from "./service-toggle";
import { ServiceDelete } from "./service-delete";

export default async function ServicosPage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", business?.id ?? "")
    .order("created_at", { ascending: true });

  const list = services ?? [];

  const { data: bookingRefs } = await supabase
    .from("bookings")
    .select("service_id")
    .eq("business_id", business?.id ?? "");

  const bookingCountByService = new Map<string, number>();
  for (const row of bookingRefs ?? []) {
    if (!row.service_id) continue;
    bookingCountByService.set(
      row.service_id,
      (bookingCountByService.get(row.service_id) ?? 0) + 1,
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Serviços</h1>
          <p className="mt-1 text-muted-foreground">Gerencie o que seu negócio oferece.</p>
        </div>
        <ServiceForm />
      </div>

      {list.length === 0 ? (
        <Card className="mt-8">
          <CardHeader className="items-center text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <CardTitle className="mt-3">Nenhum serviço ainda</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Cadastre seu primeiro serviço para começar a receber reservas.
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-3">
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
                  {(service.price_cents / 100).toFixed(2).replace(".", ",")} R$
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ServiceToggle id={service.id} isActive={service.is_active} />
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
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
