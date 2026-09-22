import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import { PLAN_INFO } from "@/lib/plan/catalog";
import type { Plan } from "@/lib/plan/plan";
import { MarketingPlanCta } from "./marketing-plan-cta";

const PLAN_KEYS: Plan[] = ["free", "pro"];

const PLAN_CTA: Record<Plan, { cta: string; highlighted: boolean }> = {
  free: { cta: "Começar grátis", highlighted: false },
  pro: { cta: "Assinar PROFISSIONAL", highlighted: true },
};

const PLAN_COPY: Record<Plan, {
  eyebrow: string;
  title: string;
  description: string;
  audience: string;
  featureDescriptions: Record<string, string>;
}> = {
  free: {
    eyebrow: "Para começar",
    title: "A base certa para organizar sua agenda",
    description: "Tenha uma página profissional e receba reservas sem depender de mensagens manuais.",
    audience: "Ideal para validar sua rotina online sem compromisso.",
    featureDescriptions: {
      "Página pública": "Um link profissional para seus clientes reservarem.",
      Dashboard: "Acompanhe sua agenda em um só lugar.",
      "Serviços ilimitados": "Cadastre tudo o que você oferece.",
      "Clientes e histórico": "Mantenha informações importantes organizadas.",
      Bloqueios: "Proteja pausas, férias e horários pessoais.",
      "Gestão de reservas": "Confirme e acompanhe cada reserva.",
      "Cancelamento self-service": "Dê autonomia para seus clientes.",
    },
  },
  pro: {
    eyebrow: "Para crescer",
    title: "Mais controle para fazer o negócio avançar",
    description: "Automatize o acompanhamento da agenda e tenha recursos para atender melhor, todos os dias.",
    audience: "Ideal para quem já atende e quer ganhar tempo e previsibilidade.",
    featureDescriptions: {
      Relatórios: "Entenda sua operação com dados mais claros.",
      "Lembretes automáticos": "Reduza esquecimentos sem precisar cobrar.",
      "Gestão da lista de espera": "Aproveite melhor cada horário disponível.",
      "Exportação Google Calendar/.ics": "Leve sua agenda para onde você já trabalha.",
    },
  },
};

export function Plans({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  return (
    <section id="planos" className="relative scroll-mt-24 overflow-hidden border-y border-border bg-muted/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.07),transparent_38%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 md:py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
              Preços simples
            </Badge>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Escolha o ritmo do seu negócio.
            </h2>
            <p className="mt-5 text-muted-foreground">
              Comece sem compromisso e evolua quando sua operação pedir mais.
            </p>
          </div>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-2">
          {PLAN_KEYS.map((key, i) => {
            const info = PLAN_INFO[key];
            const copy = PLAN_COPY[key];
            const { cta, highlighted } = PLAN_CTA[key];

            return (
              <Reveal key={key} delay={i * 100} className="h-full">
                <article
                  className={cn(
                    "group relative flex h-full flex-col overflow-hidden rounded-[2rem] border p-6 transition-all duration-300 hover:-translate-y-1 sm:p-7",
                    highlighted
                      ? "border-foreground bg-primary text-primary-foreground shadow-2xl shadow-black/25"
                      : "border-border bg-card/60 hover:border-foreground/25 hover:bg-card",
                  )}
                >
                  {highlighted && (
                    <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-white/15 blur-[80px]" />
                  )}
                  <div className="relative flex items-start justify-between gap-4">
                    <div>
                      <p className={cn("text-xs font-semibold uppercase tracking-[0.22em]", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {copy.eyebrow}
                      </p>
                      <h3 className="mt-3 max-w-sm text-2xl font-semibold tracking-tight">{info.name}</h3>
                    </div>
                    {highlighted && (
                      <Badge className="shrink-0 rounded-full border-primary-foreground/20 bg-primary-foreground/10 px-2.5 py-1 text-xs text-primary-foreground">
                        <Sparkles className="size-3" />
                        Recomendado
                      </Badge>
                    )}
                  </div>

                  <p className={cn("relative mt-5 max-w-md text-base font-medium leading-snug", highlighted ? "text-primary-foreground" : "text-foreground")}>
                    {copy.title}
                  </p>
                  <p className={cn("relative mt-2 max-w-md text-xs leading-relaxed", highlighted ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {copy.description}
                  </p>

                  <div className="relative mt-6 flex items-end gap-2">
                    <span className="text-4xl font-semibold tracking-tight">{info.price}</span>
                    <span className={cn("pb-1", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                      {info.period}
                    </span>
                  </div>
                  <p className={cn("relative mt-2 text-xs", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    {copy.audience}
                  </p>

                  <div className={cn("my-6 h-px", highlighted ? "bg-primary-foreground/15" : "bg-border")} />
                  <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    O que está incluído
                  </p>

                  <ul className="relative mt-4 grid flex-1 gap-x-5 gap-y-3 lg:grid-cols-2">
                    {info.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", highlighted ? "bg-primary-foreground/15" : "bg-muted")}>
                          <Check className={cn("size-3", highlighted ? "text-primary-foreground" : "text-foreground")} />
                        </span>
                        <span>
                          <span className={cn("block text-sm font-medium", highlighted ? "text-primary-foreground" : "text-foreground")}>{feature}</span>
                          <span className={cn("mt-0.5 block text-[11px] leading-snug", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {copy.featureDescriptions[feature]}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  {highlighted ? (
                    <MarketingPlanCta isAuthenticated={isAuthenticated} label={cta} />
                  ) : (
                    <Link
                      href="/cadastro"
                      className="relative mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-all hover:scale-[1.02] hover:border-foreground/30 active:scale-[0.98]"
                    >
                      {cta}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  )}
                  <div className={cn("mt-3 flex items-center justify-center gap-2 text-[11px]", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    <ShieldCheck className="size-3.5" />
                    Sem complicação para começar
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
