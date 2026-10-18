import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import type { BookingReadiness } from "@/lib/business/readiness";

// Next steps for a negócio whose public page cannot take reservas yet. It
// disappears once there is an active serviço and a faixa of disponibilidade.
export function SetupChecklist({ hasActiveService, hasAvailability }: BookingReadiness) {
  if (hasActiveService && hasAvailability) return null;

  const steps = [
    {
      done: hasActiveService,
      title: "Cadastre um serviço",
      description: "Informe o nome, a duração e o preço do que você atende.",
      href: "/dashboard/servicos",
      action: "Cadastrar serviço",
    },
    {
      done: hasAvailability,
      title: "Defina sua disponibilidade",
      description: "Escolha os dias e as faixas de horário em que você atende.",
      href: "/dashboard/configuracoes#disponibilidade",
      action: "Configurar disponibilidade",
    },
  ];

  return (
    <section
      aria-labelledby="setup-checklist-title"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 sm:p-6"
    >
      <h2 id="setup-checklist-title" className="text-lg font-semibold">
        Sua página ainda não aceita reservas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Conclua os passos abaixo para seus clientes conseguirem reservar pelo seu link público.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.href} className="flex items-start gap-3">
            {step.done ? (
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                {step.title}
                <span className="sr-only">{step.done ? " (concluído)" : " (pendente)"}</span>
              </p>
              <p className="text-sm text-muted-foreground">{step.description}</p>
              {!step.done && (
                <Link href={step.href} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                  {step.action} <span aria-hidden>→</span>
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
