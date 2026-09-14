import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { buildCustomerHistory } from "@/lib/customers/history";
import { ClientsList } from "./clients-list";

export default async function ClientesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const supabase = await createClient();
  const [{ data: customers }, { data: bookings }] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("*")
      .eq("business_id", business.id)
      .order("start_at", { ascending: false }),
  ]);

  const history = buildCustomerHistory(customers ?? [], bookings ?? []);

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="mt-1 text-muted-foreground">
          Busque por nome, telefone ou e-mail e veja o histórico de reservas de cada pessoa.
        </p>
      </div>

      {history.length === 0 ? (
        <Card className="mt-8">
          <CardHeader className="items-center text-center">
            <Users className="size-8 text-muted-foreground" />
            <CardTitle className="mt-3">Nenhum cliente ainda</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Quando alguém reservar um serviço, a pessoa aparece aqui automaticamente.
          </CardContent>
        </Card>
      ) : (
        <ClientsList history={history} />
      )}
    </div>
  );
}
