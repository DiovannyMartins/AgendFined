"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Phone, Mail, CalendarDays, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CustomerBooking, CustomerSummary } from "@/lib/customers/history";
import { formatPhoneBR } from "@/lib/format/phone";
import { statusLabel } from "@/lib/bookings/status";
import { formatWhen } from "@/lib/format/when";
import { semanticSearchCustomers } from "@/lib/customers/search";
import { loadCustomerBookings } from "@/lib/customers/history-actions";

const SEARCH_DEBOUNCE_MS = 300;

function clientesHref(query: string, page = 1): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (page > 1) params.set("pagina", String(page));
  const search = params.toString();
  return `/dashboard/clientes${search ? `?${search}` : ""}`;
}

// One page of clientes (#215): the server filters and paginates, so typing in
// the box navigates (debounced) and the history of a cliente is loaded when
// their card is opened.
export function ClientsList({
  customers,
  timezone,
  initialQuery = "",
  page = 1,
  totalPages = 1,
}: {
  customers: CustomerSummary[];
  timezone: string;
  initialQuery?: string;
  page?: number;
  totalPages?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [semanticMatches, setSemanticMatches] = useState<CustomerSummary[] | null>(null);
  const [isSearchingSemantically, startSemanticSearch] = useTransition();
  const lastNavigated = useRef(initialQuery.trim());

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === lastNavigated.current) return;
    const timer = setTimeout(() => {
      lastNavigated.current = trimmed;
      router.replace(clientesHref(trimmed));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, router]);

  function runSemanticSearch() {
    const trimmed = query.trim();
    if (!trimmed) {
      setSemanticMatches(null);
      return;
    }
    startSemanticSearch(async () => {
      const result = await semanticSearchCustomers(trimmed);
      setSemanticMatches(result ? result.customers : null);
    });
  }

  const shown = semanticMatches ?? customers;

  return (
    <div className="mt-6">
      <div className="relative mb-4 max-w-sm">
        <span className="pointer-events-none absolute left-0 top-0 flex h-9 items-center pl-3">
          <Search className="size-4 text-muted-foreground" />
        </span>
        <Input
          type="search"
          aria-label="Buscar clientes"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSemanticMatches(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSemanticSearch();
            }
          }}
          placeholder="Buscar por nome, telefone ou e-mail"
          className="h-9 pl-10 leading-none"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Pressione Enter para buscar também pelo histórico de reservas.
          {isSearchingSemantically ? " Buscando..." : ""}
        </p>
      </div>

      {shown.length === 0 ? (
        <CardEmpty query={query} />
      ) : (
        <div className="space-y-3">
          {shown.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} timezone={timezone} />
          ))}
        </div>
      )}

      {!semanticMatches && totalPages > 1 && (
        <nav aria-label="Páginas de clientes" className="mt-6 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={clientesHref(query, page - 1)} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={clientesHref(query, page + 1)} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Próxima
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function CustomerCard({ customer, timezone }: { customer: CustomerSummary; timezone: string }) {
  const [bookings, setBookings] = useState<CustomerBooking[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, startLoading] = useTransition();

  function loadHistory(open: boolean) {
    if (!open || bookings) return;
    setFailed(false);
    startLoading(async () => {
      const result = await loadCustomerBookings(customer.id);
      if (result) setBookings(result);
      else setFailed(true);
    });
  }

  return (
    <Dialog onOpenChange={loadHistory}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted"
          >
            <div className="min-w-0">
              <p className="font-medium">{customer.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" /> {formatPhoneBR(customer.phone)}
                </span>
                {customer.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3.5" /> {customer.email}
                  </span>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {customer.booking_count} {customer.booking_count === 1 ? "reserva" : "reservas"}
            </Badge>
          </button>
        }
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{customer.name}</DialogTitle>
            <DialogDescription>
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {formatPhoneBR(customer.phone)}
              </span>
              {customer.email && (
                <span className="ml-3 inline-flex items-center gap-1">
                  <Mail className="size-3.5" /> {customer.email}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {failed ? (
            <p className="py-4 text-sm text-muted-foreground">
              Não foi possível carregar o histórico agora. Feche e abra de novo para tentar outra vez.
            </p>
          ) : bookings === null || isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Carregando histórico...</p>
          ) : (
            <HistoryList bookings={bookings} timezone={timezone} />
          )}
        </DialogContent>
      </DialogTrigger>
    </Dialog>
  );
}

function HistoryList({
  bookings,
  timezone,
}: {
  bookings: CustomerBooking[];
  timezone: string;
}) {
  if (bookings.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nenhuma reserva registrada para este cliente.
      </p>
    );
  }
  return (
    <ul className="max-h-80 space-y-3 overflow-y-auto">
      {bookings.map((booking) => {
        const status = statusLabel(booking.status);
        return (
          <li key={booking.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                <CalendarDays className="mr-1 inline size-4 text-muted-foreground" />
                {formatWhen(booking.start_at, timezone)}
              </p>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Ticket className="size-3.5" /> {booking.service_name_snapshot} ·{" "}
              {booking.duration_minutes_snapshot} min
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function CardEmpty({ query }: { query: string }) {
  return (
    <div className="rounded-xl border border-border py-8 text-center text-muted-foreground">
      {query.trim() ? <>Nenhum cliente encontrado para “{query}”.</> : <>Nenhum cliente nesta página.</>}
    </div>
  );
}
