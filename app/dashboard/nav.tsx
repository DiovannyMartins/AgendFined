"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CalendarDays, UserRound, Blocks, CalendarPlus, Settings, Sparkles, BarChart3, Hourglass, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyPublicLink } from "@/components/copy-public-link";
import { logout } from "@/lib/auth/actions";

const links = [
  { href: "/dashboard", label: "Início", icon: CalendarClock },
  { href: "/dashboard/servicos", label: "Serviços", icon: Sparkles },
  { href: "/dashboard/agenda", label: "Reservas", icon: CalendarDays },
  { href: "/dashboard/clientes", label: "Clientes", icon: UserRound },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/dashboard/lista-de-espera", label: "Lista de espera", icon: Hourglass },
  { href: "/dashboard/bloqueios", label: "Bloqueios", icon: Blocks },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
];

export function DashboardNav({ slug }: { slug: string | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="w-full border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r lg:bg-background lg:px-5 lg:py-8 lg:backdrop-blur-none">
      <div className="mb-3 flex items-center justify-between lg:mb-10 lg:w-[216px]">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          AgendFined
        </Link>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="dashboard-menu"
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      <div
        id="dashboard-menu"
        className={cn(
          "lg:flex lg:flex-1 lg:flex-col lg:items-start lg:gap-2",
          mobileOpen ? "flex flex-col gap-1" : "hidden",
        )}
      >
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:w-[216px]",
                active
                  ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <link.icon className="size-4" />
              {link.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 lg:mt-auto lg:w-[216px] lg:flex-col lg:items-stretch lg:pt-4">
        {slug ? (
          <CopyPublicLink slug={slug}>Compartilhar página</CopyPublicLink>
        ) : (
          <Link
            href="/dashboard/configuracoes"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <CalendarPlus className="size-4" />
            Compartilhar página
          </Link>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:w-full"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </form>
      </div>
    </nav>
  );
}
