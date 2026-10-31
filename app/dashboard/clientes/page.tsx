import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import {
  CUSTOMER_PAGE_SIZE,
  customerSearchFilter,
  toCustomerSummary,
} from "@/lib/customers/history";
import { ClientsList } from "./clients-list";

export const metadata: Metadata = { title: "Clientes — AgendFined" };

function parsePage(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; pagina?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const page = parsePage(params.pagina);

  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  // One page at a time, filtered and counted in the database (#215): the whole
  // list was cut at PostgREST's 1000 rows and sent every column of every
  // cliente and reserva to the browser.
  const supabase = await createClient();
  let request = supabase
    .from("customers")
    .select("id, name, phone, email", { count: "exact" })
    .eq("business_id", business.id);
  const filter = customerSearchFilter(query);
  if (filter) request = request.or(filter);
  const from = (page - 1) * CUSTOMER_PAGE_SIZE;
  const { data, count } = await request
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + CUSTOMER_PAGE_SIZE - 1);

  const rows = data ?? [];
  const { data: counts } = rows.length
    ? await supabase.rpc("customer_booking_counts", {
        p_business_id: business.id,
        p_customer_ids: rows.map((row) => row.id),
      })
    : { data: [] };
  const countById = new Map((counts ?? []).map((row) => [row.customer_id, Number(row.booking_count)]));
  const customers = rows.map((row) => toCustomerSummary(row, countById.get(row.id) ?? 0));
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Busque por nome, telefone ou e-mail e veja o histórico de reservas de cada pessoa.
        </p>
      </div>

      {total === 0 && !filter ? (
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
        <ClientsList
          customers={customers}
          timezone={business.timezone}
          initialQuery={query}
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}
