import { redirect } from "next/navigation";
import { BusinessForm } from "./business-form";
import { AvailabilityForm, AvailabilityRow } from "./availability-form";
import { PlanSection } from "./plan-section";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getCurrentBusinessRole } from "@/lib/business/queries";
import { TeamManagement } from "./team-management";

export default async function ConfiguracoesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = await getCurrentBusinessRole();
  const { data: members } = role === "admin"
    ? await supabase.from("business_memberships").select("user_id, role").eq("business_id", business.id)
    : { data: [] };
  const { data: availability } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      {user?.id === business.owner_id && <BusinessForm initial={business} />}

      {role === "admin" && <PlanSection business={{ id: business.id, plan: business.plan }} />}

      {user && role && <TeamManagement userId={user.id} role={role} members={members ?? []} />}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Segurança da conta</h2>
        <p className="text-muted-foreground">Ative a autenticação em duas etapas com um aplicativo autenticador.</p>
        <Link href="/mfa" className="inline-block text-sm underline">Configurar autenticação em duas etapas</Link>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Disponibilidade recorrente</h2>
        <p className="mt-1 text-muted-foreground">
          Defina as faixas de atendimento por dia da semana, em hora local do negócio.
        </p>
        <div className="mt-4 rounded-xl border border-border p-4">
          {role !== "user" && <AvailabilityForm />}
        </div>
        {availability && availability.length > 0 && (
          <div className="mt-4 space-y-2">
            {availability.map((row) => (
              role === "user" ? (
                <p key={row.id} className="text-sm">Dia {row.weekday}: {row.start_time}–{row.end_time}</p>
              ) : (
                <AvailabilityRow
                  key={row.id}
                  id={row.id}
                  weekday={row.weekday}
                  startTime={row.start_time}
                  endTime={row.end_time}
                />
              )
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
