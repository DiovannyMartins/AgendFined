import Link from "next/link";
import {
  ArrowRight,
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
      <section className="border-y border-border py-10">
        <Reveal>
          <p className="text-center text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Feito para pequenos negócios
          </p>
        </Reveal>
        <div className="mask-fade-x mt-6 overflow-hidden">
          <div className="flex w-max motion-safe:animate-marquee motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-x-10 motion-reduce:gap-y-3">
            {[...audiences, ...audiences, ...audiences, ...audiences].map((item, i) => (
              <span
                key={`${item.label}-${i}`}
                className="pr-6 text-base font-medium whitespace-nowrap text-muted-foreground"
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 md:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4 rounded-full px-3.5 text-sm">
              Por que usar o AgendFined
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Menos mensagens, mais clientes atendidos
            </h2>
            <p className="mt-4 text-muted-foreground">
              Organize seu negócio e deixe a agenda trabalhar sozinha.
            </p>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 80}>
              <Card className="h-full transition-all duration-300 group-hover:border-primary/30 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5">
                <CardHeader>
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <b.icon className="size-5" />
                  </div>
                  <CardTitle className="pt-4">{b.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{b.description}</CardDescription>
                </CardHeader>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="relative border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6 md:py-28">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-4 rounded-full px-3.5 text-sm">
                Simples de usar
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Como funciona</h2>
              <p className="mt-4 text-muted-foreground">Configure, compartilhe e receba reservas.</p>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {howItWorks.map((item, i) => (
              <Reveal key={item.step} delay={i * 100}>
                <div className="group relative h-full rounded-2xl border border-border bg-background p-8 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30">
                  <div className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
                    {item.step}
                  </div>
                  <h3 className="mt-4 text-lg font-medium">{item.title}</h3>
                  <p className="mt-2 text-muted-foreground">{item.description}</p>
                  {i < howItWorks.length - 1 && (
                    <ArrowRight className="absolute top-1/2 -right-4 hidden size-5 -translate-y-1/2 text-muted-foreground md:block" />
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto w-full max-w-6xl px-4 py-14 lg:px-6 md:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="secondary" className="mb-4 rounded-full px-3.5 text-sm">
              Tudo em um só lugar
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tudo o que você precisa
            </h2>
            <p className="mt-4 text-muted-foreground">
              Serviços, disponibilidade, bloqueios, reservas, clientes e configurações.
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="group flex h-full gap-4 rounded-2xl border border-border p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-muted/20">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Planos */}
      <Plans />

      {/* Sobre */}
      <section id="sobre" className="border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center lg:px-6 md:py-20">
          <Reveal>
            <Badge variant="secondary" className="mb-4 rounded-full px-3.5 text-sm">
              Sobre o AgendFined
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Mais tempo para cuidar do seu negócio
            </h2>
            <p className="mt-4 text-muted-foreground">
              O AgendFined ajuda profissionais e pequenos negócios a organizar a
              agenda, receber reservas online e oferecer uma experiência simples
              para seus clientes.
            </p>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-14 lg:px-6 md:py-20">
        <Reveal>
          <div className="text-center">
            <Badge variant="secondary" className="mb-4 rounded-full px-3.5 text-sm">
              Dúvidas
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Perguntas frequentes
            </h2>
          </div>
        </Reveal>
        <div className="mt-10 space-y-3">
          <Faq />
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 lg:px-6 md:pb-28">
        <Reveal variant="zoom">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-14">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[560px] -translate-x-1/2 rounded-full bg-black/15 blur-[100px]" />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
              Crie sua agenda agora
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-primary-foreground/80">
              Leva menos de um minuto para começar a receber reservas online.
            </p>
            <Link
              href="/cadastro"
              className="group relative mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-background px-7 text-sm font-medium text-foreground transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Criar minha agenda
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
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
