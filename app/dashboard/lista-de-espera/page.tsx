import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SuspendedPrompt } from "@/components/suspended-prompt";
import { getCurrentBusiness } from "@/lib/business/queries";
import { getWaitlistManagement } from "@/lib/waitlist/get-management";
import { formatWhen } from "@/lib/format/when";
import { formatPhoneBR } from "@/lib/format/phone";
import { waitlistStatusLabel } from "@/lib/waitlist/status";
import type { ManageWaitlistEntry } from "@/lib/waitlist/manage";
import { WaitlistActions } from "./waitlist-actions";

export const metadata: Metadata = { title: "Lista de espera — AgendFined" };

export default async function ListaEsperaPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const result = await getWaitlistManagement({
    getBusiness: async () => ({ id: business.id, has_access: business.has_access }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Lista de espera</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Clientes que aguardam um horário ocupado e que você pode notificar ou converter em reserva.
        </p>
      </div>

      {result.status === "access_required" && (
        <SuspendedPrompt description="Seus dados continuam guardados. Assine o Plano AgendFined para ver quem espera por um horário, avisar e converter em reserva." />
      )}
      {result.status === "error" && <ErrorState />}
      {result.status === "ok" && (
        <EntriesList entries={result.entries} timezone={business.timezone} />
      )}
    </div>
  );
}

function EntriesList({ entries, timezone }: { entries: ManageWaitlistEntry[]; timezone: string }) {
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
                {formatWhen(entry.start_at, timezone)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {entry.customer_name} · {formatPhoneBR(entry.customer_phone)}
                {entry.customer_email ? ` · ${entry.customer_email}` : ""}
              </p>
            </div>
            <WaitlistActions id={entry.id} status={entry.status} />
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
