import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  Home,
  Sparkles,
} from "lucide-react";

const week = ["S", "T", "Q", "Q", "S", "S", "D"];
const days = ["12", "13", "14", "15", "16", "17", "18"];

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(148,163,184,0.08),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-10 pt-6 sm:px-8 sm:pt-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="group inline-flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-black/20 transition-transform duration-300 group-hover:scale-105">
              <CalendarClock className="size-4" />
            </span>
            <span>AgendFined</span>
          </Link>

          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3.5 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Home className="size-3.5" />
            Início
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-16 sm:py-24 lg:py-20">
          <div className="grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <section className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <Sparkles className="size-3.5 text-foreground" />
                Erro 404
              </div>

              <p className="mt-7 font-display text-4xl leading-none text-muted-foreground sm:text-5xl">
                Parece que este horário
              </p>
              <h1 className="mt-2 text-balance text-6xl font-semibold leading-[0.9] tracking-[-0.07em] text-gradient sm:text-8xl">
                ficou fora da agenda.
              </h1>
              <p className="mt-7 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
                A página que você procura não existe, foi movida ou o endereço foi digitado de um jeito diferente.
              </p>

              <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/"
                  className="group inline-flex h-12 items-center gap-3 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xl shadow-black/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-2xl active:translate-y-0"
                >
                  <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                  Voltar para o início
                </Link>
                <Link
                  href="/#recursos"
                  className="group inline-flex items-center gap-2 px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Conhecer o AgendFined
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </section>

            <div aria-hidden="true" className="relative mx-auto w-full max-w-xl lg:justify-self-end">
              <div className="absolute -inset-10 rounded-full bg-white/[0.06] blur-3xl" />
              <div className="relative rotate-1 rounded-[2rem] border border-border/80 bg-card/80 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl transition-transform duration-500 hover:rotate-0">
                <div className="rounded-[1.5rem] border border-border/70 bg-background/90 p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Agenda semanal
                      </p>
                      <p className="mt-2 text-xl font-semibold tracking-tight">Nada por aqui</p>
                    </div>
                    <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/70">
                      <CalendarClock className="size-5 text-muted-foreground" />
                    </span>
                  </div>

                  <div className="mt-7 grid grid-cols-7 gap-1.5 sm:gap-2">
                    {week.map((day, index) => (
                      <div key={`${day}-${index}`} className="text-center text-[10px] font-semibold uppercase text-muted-foreground">
                        {day}
                      </div>
                    ))}
                    {days.map((day, index) => (
                      <div
                        key={day}
                        className={`flex aspect-square items-center justify-center rounded-xl border text-sm transition-colors ${
                          index === 2
                            ? "border-foreground bg-foreground font-semibold text-background shadow-[0_0_24px_rgba(255,255,255,0.16)]"
                            : "border-border/70 bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="my-6 h-px bg-border" />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        Próximo horário
                      </div>
                      <p className="mt-3 text-2xl font-semibold tracking-tight">— —</p>
                      <p className="mt-1 text-xs text-muted-foreground">Nenhum horário encontrado</p>
                    </div>
                    <div className="rounded-2xl border border-dashed border-border p-4">
                      <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" />
                      </div>
                      <p className="mt-4 text-sm font-medium">Tudo organizado</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Só precisamos encontrar o caminho de volta.</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground/70">Este endereço não está disponível na sua agenda.</p>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border/70 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} AgendFined</p>
          <p>Menos mensagens. Mais tempo para o seu negócio.</p>
        </footer>
      </div>
    </main>
  );
}
