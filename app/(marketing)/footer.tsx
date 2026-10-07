import Link from "next/link";
import { ArrowUpRight, CalendarClock } from "lucide-react";

const columns = [
  {
    title: "Produto",
    links: [
      { href: "/#recursos", label: "Recursos" },
      { href: "/#como-funciona", label: "Como funciona" },
      { href: "/#planos", label: "Planos" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { href: "/#faq", label: "FAQ" },
      { href: "/#sobre", label: "Sobre" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacidade", label: "Privacidade" },
      { href: "/termos", label: "Termos" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Link href="/" className="group inline-flex items-center gap-2 font-semibold">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-300 group-hover:scale-105">
                <CalendarClock className="size-4" />
              </span>
              <span>AgendFined</span>
            </Link>
            <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted-foreground">
              Sua agenda trabalhando por você, 24 horas por dia.
            </p>
            <Link
              href="/cadastro"
              className="group mt-7 inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-muted-foreground"
            >
              Criar minha agenda
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {col.title}
                </h3>
                <ul className="mt-5 space-y-3 text-sm">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-foreground/75 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} AgendFined. Todos os direitos reservados.</p>
          <p>Feito para pequenos negócios.</p>
        </div>
      </div>
    </footer>
  );
}
