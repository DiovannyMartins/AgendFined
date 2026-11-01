import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/reveal";
import { AGENDFINED_PLAN_INFO } from "@/lib/plan/catalog";
import { MarketingPlanCta } from "./marketing-plan-cta";

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  "Página pública": "Um link profissional para seus clientes reservarem.",
  "Serviços ilimitados": "Cadastre tudo o que você oferece.",
  "Clientes e histórico": "Mantenha informações importantes organizadas.",
  Bloqueios: "Proteja pausas, férias e horários pessoais.",
  Relatórios: "Entenda sua operação com dados mais claros.",
  "Lembretes automáticos": "Reduza esquecimentos sem precisar cobrar.",
  "Gestão da lista de espera": "Aproveite melhor cada horário disponível.",
  "Exportação Google Calendar/.ics": "Leve sua agenda para onde você já trabalha.",
  "Reservas futuras até 365 dias": "Abra a agenda com até um ano de antecedência.",
};

// The card of the Plano AgendFined, the only plan (ADR 0013, spec 007 FR-015).
export function Plans({ isAuthenticated }: { isAuthenticated?: boolean }) {
  const info = AGENDFINED_PLAN_INFO;

  return (
    <section id="planos" className="relative scroll-mt-24 overflow-hidden border-y border-border bg-muted/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.07),transparent_38%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 md:py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
              Preço simples
            </Badge>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Um plano, tudo incluído.
            </h2>
            <p className="mt-5 text-muted-foreground">
              Teste o AgendFined completo por 30 dias, sem cartão. Depois, continue por {info.price}{info.period}.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100} className="mx-auto mt-10 block max-w-3xl">
          <article className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-foreground bg-primary p-6 text-primary-foreground shadow-2xl shadow-black/25 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-white/15 blur-[80px]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/60">
                Plano único
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">{info.name}</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-primary-foreground/70">{info.description}</p>
            </div>

            <div className="relative mt-6 flex items-end gap-2">
              <span className="text-4xl font-semibold tracking-tight">{info.price}</span>
              <span className="pb-1 text-primary-foreground/60">{info.period}</span>
            </div>
            <p className="relative mt-3 text-sm font-medium">
              30 dias grátis, sem cartão · depois {info.price}{info.period} · cancele quando quiser
            </p>

            <div className="my-6 h-px bg-primary-foreground/15" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/60">
              O que está incluído
            </p>

            <ul className="relative mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {info.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                    <Check className="size-3 text-primary-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{feature}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-primary-foreground/60">
                      {FEATURE_DESCRIPTIONS[feature]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mx-auto w-full max-w-sm">
              <MarketingPlanCta isAuthenticated={isAuthenticated} />
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
