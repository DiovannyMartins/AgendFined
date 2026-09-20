import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CalendarCheck,
  CalendarClock,
  Clock,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";
import { Faq } from "./faq";
import { Plans } from "./plans";
import { Hero } from "@/components/marketing/hero";

const benefits = [
  {
    icon: CalendarClock,
    title: "Agendamento 24/7",
    description:
      "Seus clientes reservam mesmo quando você está ocupado ou fora do expediente, sem mensagens para responder.",
  },
  {
    icon: CalendarCheck,
    title: "Agenda organizada",
    description:
      "Horários calculados a partir de regras recorrentes, bloqueios e reservas existentes, sem conflitos.",
  },
  {
    icon: MessageSquare,
    title: "Menos trabalho manual",
    description:
      "Chega de troca de mensagens para confirmar serviço, data e hora. O cliente reserva sozinho.",
  },
  {
    icon: Sparkles,
    title: "Experiência profissional",
    description:
      "Cada negócio possui uma página pública de reservas responsiva, pronta para compartilhar.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Configure",
    description: "Crie seu negócio, cadastre serviços e defina sua disponibilidade.",
  },
  {
    step: "02",
    title: "Compartilhe",
    description: "Divulgue seu link público pelo WhatsApp, Instagram ou redes sociais.",
  },
  {
    step: "03",
    title: "Receba reservas",
    description: "Seus clientes reservam enquanto você acompanha tudo no painel.",
  },
];

const features = [
  { icon: CalendarClock, title: "Serviços", description: "Cadastre serviços com duração e preço, desative sem perder histórico." },
  { icon: Clock, title: "Disponibilidade", description: "Dias e múltiplas faixas de atendimento recorrente em hora local." },
  { icon: CalendarCheck, title: "Bloqueios", description: "Bloqueie períodos específicos para pausas, férias e exceções." },
  { icon: Users, title: "Reservas", description: "Coleta dados do cliente e confirma o horário sem autenticação." },
  { icon: Smartphone, title: "Página pública", description: "Seu cliente escolhe o serviço, a data e o horário disponível." },
  { icon: ShieldCheck, title: "Segurança", description: "Validação no servidor, RLS e isolamento entre negócios." },
];

const audiences = [
  { label: "Barbearias" },
  { label: "Salões de beleza" },
  { label: "Clínicas" },
  { label: "Profissionais autônomos" },
  { label: "Estúdios" },
  { label: "Personal trainers" },
  { label: "Consultorias" },
];

export default function MarketingHome() {
  return (
    <div className="flex flex-col">
      <Hero>
        <BookingPreview />
      </Hero>

      {/* Prova social */}
      <section className="relative overflow-hidden border-y border-border bg-muted/20 py-12 md:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Feito para pequenos negócios
                </p>
                <p className="mt-2 text-sm text-foreground/70">
                  Uma agenda simples para quem precisa de tempo de verdade.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                Pronto para começar
              </div>
            </div>
          </Reveal>
          <div className="mask-fade-x mt-8 overflow-hidden">
            <div className="flex w-max gap-3 motion-safe:animate-marquee motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-3">
              {[...audiences, ...audiences, ...audiences, ...audiences].map((item, i) => (
                <span
                  key={`${item.label}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-medium whitespace-nowrap text-foreground/75"
                >
                  <span className="size-1.5 rounded-full bg-foreground/40" />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 lg:px-6 md:py-32">
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
                Por que usar o AgendFined
              </Badge>
              <h2 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Menos mensagens.
                <span className="block text-muted-foreground">Mais clientes atendidos.</span>
              </h2>
            </div>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground lg:justify-self-end">
              Organize seu negócio e deixe a agenda trabalhar sozinha enquanto você
              cuida do que realmente importa.
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 80}>
              <Card className="group relative h-full overflow-hidden border-border/80 bg-card/70 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/25 hover:bg-card hover:shadow-2xl hover:shadow-black/20">
                <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-white/5 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <CardHeader className="relative p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-muted/60 text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                      <b.icon className="size-5" />
                    </div>
                    <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
                      0{i + 1}
                    </span>
                  </div>
                  <CardTitle className="pt-10 text-lg">{b.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{b.description}</CardDescription>
                </CardHeader>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="relative overflow-hidden border-y border-border bg-muted/20">
        <div className="pointer-events-none absolute -left-40 top-1/2 size-[32rem] -translate-y-1/2 rounded-full bg-white/[0.035] blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 bottom-[-12rem] size-[28rem] rounded-full bg-zinc-500/[0.04] blur-[120px]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-24 lg:px-6 md:py-32">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
                Simples de usar
              </Badge>
              <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Do primeiro clique à reserva.
              </h2>
              <p className="mt-5 text-muted-foreground">
                Configure uma vez. Compartilhe seu link. Deixe o AgendFined cuidar do resto.
              </p>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {howItWorks.map((item, i) => (
              <Reveal key={item.step} delay={i * 100}>
                <div className="group relative h-full rounded-3xl border border-border bg-background/80 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/25 hover:shadow-xl hover:shadow-black/20">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                      {item.step}
                    </span>
                    {i < howItWorks.length - 1 ? (
                      <ArrowUpRight className="size-5 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                    ) : (
                      <CheckCircle2 className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <h3 className="mt-12 text-xl font-medium">{item.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto w-full max-w-6xl px-4 py-24 lg:px-6 md:py-32">
        <Reveal>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
                Tudo em um só lugar
              </Badge>
              <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                A operação do seu negócio, sem complicação.
              </h2>
            </div>
            <p className="max-w-sm text-muted-foreground md:text-right">
              Serviços, disponibilidade, bloqueios, reservas, clientes e configurações em uma só visão.
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="group flex h-full gap-4 rounded-3xl border border-border bg-card/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/25 hover:bg-card hover:shadow-xl hover:shadow-black/10">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/70 text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                  <f.icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Planos */}
      <Plans />

      {/* Sobre */}
      <section id="sobre" className="relative overflow-hidden border-y border-border bg-muted/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.06),transparent_35%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-6 md:py-32">
          <Reveal>
            <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
              Sobre o AgendFined
            </Badge>
            <h2 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Mais tempo para cuidar do seu negócio.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              O AgendFined ajuda profissionais e pequenos negócios a organizar a agenda,
              receber reservas online e oferecer uma experiência simples para seus clientes.
            </p>
            <Link
              href="/#recursos"
              className="group mt-8 inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-muted-foreground"
            >
              Conheça os recursos
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
          <Reveal delay={120} variant="zoom">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { value: "24/7", label: "Sua agenda disponível" },
                { value: "1 link", label: "Para compartilhar" },
                { value: "0 conflito", label: "Entre horários" },
                { value: "+ tempo", label: "Para o seu negócio" },
              ].map((item) => (
                <div key={item.value} className="rounded-3xl border border-border bg-background/70 p-6 backdrop-blur-sm">
                  <p className="text-3xl font-semibold tracking-tight">{item.value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 lg:grid-cols-[0.75fr_1.25fr] lg:px-6 md:py-32">
        <Reveal>
          <Badge variant="secondary" className="mb-5 rounded-full px-3.5 text-sm">
            Dúvidas
          </Badge>
          <h2 className="max-w-md text-4xl font-semibold tracking-tight sm:text-5xl">
            Tudo claro antes de começar.
          </h2>
          <p className="mt-5 max-w-sm leading-relaxed text-muted-foreground">
            Ainda ficou com alguma dúvida? A resposta provavelmente está aqui.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <Faq />
        </Reveal>
      </section>

      {/* CTA final */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 lg:px-6 md:pb-32">
        <Reveal variant="zoom">
          <div className="group relative overflow-hidden rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:px-14 md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(255,255,255,0.55),transparent_46%)] opacity-60" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),transparent_42%)] opacity-70" />
            <div className="relative">
              <Badge className="rounded-full border-primary-foreground/20 bg-primary-foreground/10 px-3.5 py-1 text-primary-foreground">
                Comece hoje
              </Badge>
              <h2 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
                Crie sua agenda agora.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-primary-foreground/70">
                Leva menos de um minuto para começar a receber reservas online.
              </p>
              <Link
                href="/cadastro"
                className="group/cta relative mt-9 inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full bg-background px-7 text-sm font-medium text-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Criar minha agenda
                <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-1" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function BookingPreview() {
  return (
    <div className="relative rounded-3xl border border-border bg-card/80 p-4 text-left shadow-2xl backdrop-blur-sm">
      <div className="rounded-2xl bg-background p-5">
        <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="size-4" />
            </span>
            Barbearia Demo
          </div>
          <Badge variant="secondary">
            <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            Disponível
          </Badge>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 space-y-2.5">
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Serviço
              </p>
              <p className="mt-1 text-sm font-medium">Corte + Barba</p>
              <p className="text-sm text-muted-foreground">R$ 60 · 45 min</p>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Data", value: "Hoje, 14:30" },
                { label: "Cliente", value: "Maria S." },
                { label: "Status", value: "Confirmada" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid flex-1 content-start grid-cols-3 gap-2">
            {["08:00", "08:30", "09:00", "09:30", "10:00", "10:30"].map((time, i) => (
              <div
                key={time}
                className={
                  "rounded-lg border px-2 py-2 text-center text-sm transition-colors " +
                  (i === 2
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border motion-safe:hover:bg-muted motion-safe:hover:animate-none")
                }
              >
                {time}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
