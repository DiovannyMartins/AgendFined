import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Banknote, CalendarX2, Crown, MailCheck, Percent, UserX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBillingReport } from "@/lib/reports/get-report";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import {
  DEFAULT_RANGE_KEY,
  RANGE_KEYS,
  RANGE_LABELS,
  formatCurrencyBRL,
  formatRate,
  type BillingReport,
  type ReportInsight,
} from "@/lib/reports/reports";
import { cn } from "@/lib/utils";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const result = await getBillingReport(range);

  if (result.status === "no_business") redirect("/dashboard/setup");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="mt-1 text-muted-foreground">
            Faturamento, serviços mais vendidos e taxas de cancelamento e no-show.
          </p>
        </div>
        {result.status !== "upgrade_required" && (
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
            {RANGE_KEYS.map((key) => {
              const active = range ? key === range : key === DEFAULT_RANGE_KEY;
              return (
                <Link
                  key={key}
                  href={`/dashboard/relatorios?range=${key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {RANGE_LABELS[key]}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {result.status === "upgrade_required" && (
        <UpgradePrompt
          title="Relatórios é um recurso PROFISSIONAL"
          description="Assine o PROFISSIONAL para ver faturamento, serviços mais vendidos e taxas de cancelamento e no-show."
        />
      )}
      {result.status === "error" && <ErrorState />}
      {result.status === "ok" && <ReportBody key={result.key} report={result.report} insight={result.insight} />}
    </div>
  );
}

function ReportBody({ report, insight }: { report: BillingReport; insight?: ReportInsight }) {
  const stats = [
    {
      label: "Faturamento no período",
      value: formatCurrencyBRL(report.revenueCents),
      icon: Banknote,
      note: `${report.completed} atendimento(s) concluído(s)`,
    },
    {
      label: "Reservas no período",
      value: String(report.totalBookings),
      icon: Crown,
      note: `${report.confirmed} confirmada(s) · ${report.completed} concluída(s)`,
    },
    {
      label: "Taxa de cancelamento",
      value: formatRate(report.cancellationRate),
      icon: CalendarX2,
      note: `${report.cancelled} cancelada(s) de ${report.totalBookings}`,
    },
    {
      label: "Taxa de no-show",
      value: formatRate(report.noShowRate),
      icon: UserX,
      note: `${report.noShow} falta(s) de ${report.totalBookings}`,
    },
  ];

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {insight && (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Leitura assistida</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {insight.kind === "insufficient_data" && "Há poucas reservas no período para tirar uma conclusão confiável."}
            {insight.kind === "healthy" && "Não há um sinal dominante de cancelamentos ou no-shows exigindo atenção."}
            {insight.kind === "watch_cancellation_rate" && "A taxa de cancelamento é o principal indicador para acompanhar neste período."}
            {insight.kind === "watch_no_show_rate" && "A taxa de no-show é o principal indicador para acompanhar neste período."}
          </CardContent>
        </Card>
      )}
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <stat.icon className="size-4" />
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.note}</p>
          </CardContent>
        </Card>
      ))}

      {report.totalBookings === 0 ? (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma reserva no período selecionado.
          </CardContent>
        </Card>
      ) : (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="size-4 text-primary" /> Serviço mais vendido
            </CardTitle>
            <CardDescription>Por quantidade de atendimentos concluídos.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.topService ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{report.topService.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {report.topService.count} atendimento(s) concluído(s)
                  </p>
                </div>
                <Badge variant="secondary">
                  <ArrowUpRight className="size-3.5" />
                  {formatCurrencyBRL(report.topService.revenueCents)}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum atendimento concluído no período.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 sm:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailCheck className="size-4 text-primary" /> Lembretes por e-mail
          </CardTitle>
          <CardDescription>
            Seus clientes recebem um lembrete quando a reserva está a até 24 horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          O envio é automático e programado; nenhuma ação é necessária no seu painel.
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState() {
  return (
    <Card className="mt-6">
      <CardContent className="py-10 text-center text-muted-foreground">
        Não foi possível carregar os relatórios. Tente novamente.
      </CardContent>
    </Card>
  );
}
