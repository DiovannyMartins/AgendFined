import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { getCurrentBusiness } from "@/lib/business/queries";
import { getWaitlistManagement } from "@/lib/waitlist/get-management";
import { formatWhen } from "@/lib/format/when";
import { waitlistStatusLabel } from "@/lib/waitlist/status";
import type { ManageWaitlistEntry } from "@/lib/waitlist/manage";
import { WaitlistActions } from "./waitlist-actions";

export default async function ListaEsperaPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const result = await getWaitlistManagement({
    getBusiness: async () => ({ id: business.id, plan: business.plan }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Lista de espera</h1>
        <p className="mt-1 text-muted-foreground">
          Clientes que aguardam um horário ocupado e que você pode notificar ou converter em reserva.
        </p>
      </div>

      {result.status === "upgrade_required" && (
        <UpgradePrompt
          title="A gestão da lista de espera é um recurso PROFISSIONAL"
          description="Assine o PROFISSIONAL para ver quem espera por um horário, notificar e converter em reserva."
        />
      )}
      {result.status === "error" && <ErrorState />}
      {result.status === "ok" && (
        <EntriesList entries={result.entries} />
      )}
    </div>
  );
}

function EntriesList({ entries }: { entries: ManageWaitlistEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-10 text-center text-muted-foreground">
          Nenhum cliente na lista de espera.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {entries.map((entry) => {
        const status = waitlistStatusLabel(entry.status);
        return (
          <div
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{entry.service_name}</p>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatWhen(entry.start_at)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {entry.customer_name} · {entry.customer_phone}
                {entry.customer_email ? ` · ${entry.customer_email}` : ""}
              </p>
              {entry.priority_score !== undefined && entry.priority_confidence !== undefined && entry.priority_confidence >= 0.7 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Prioridade assistida: {entry.priority_score >= 2.5 ? "alta" : entry.priority_score >= 1.5 ? "média" : "baixa"}
                </p>
              )}
            </div>
            <WaitlistActions entry={entry} />
          </div>
        );
      })}
    </div>
  );
}

function ErrorState() {
  return (
    <Card className="mt-6">
      <CardContent className="py-10 text-center text-muted-foreground">
        Não foi possível carregar a lista de espera. Tente novamente.
      </CardContent>
    </Card>
  );
}
