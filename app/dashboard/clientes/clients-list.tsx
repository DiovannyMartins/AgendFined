"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Phone, Mail, CalendarDays, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { filterCustomers, type CustomerHistory } from "@/lib/customers/history";
import { statusLabel } from "@/lib/bookings/status";
import { formatWhen } from "@/lib/format/when";
import { semanticSearchCustomers } from "@/lib/customers/search";

export function ClientsList({
  history,
}: {
  history: CustomerHistory[];
}) {
  const [query, setQuery] = useState("");
  const [semanticIds, setSemanticIds] = useState<Set<string> | null>(null);
  const [isSearchingSemantically, startSemanticSearch] = useTransition();

  function runSemanticSearch() {
    const trimmed = query.trim();
    if (!trimmed) {
      setSemanticIds(null);
      return;
    }
    startSemanticSearch(async () => {
      const result = await semanticSearchCustomers(history, trimmed);
      setSemanticIds(result ? new Set(result.ids) : null);
    });
  }

  const shown = useMemo(() => {
    if (semanticIds) return history.filter((h) => semanticIds.has(h.customer.id));
    const matchedRows = filterCustomers(
      history.map((h) => h.customer),
      query,
    );
    const ids = new Set(matchedRows.map((c) => c.id));
    return history.filter((h) => ids.has(h.customer.id));
  }, [history, query, semanticIds]);

  return (
    <div className="mt-6">
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSemanticIds(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSemanticSearch();
            }
          }}
          placeholder="Buscar por nome, telefone ou e-mail"
          className="pl-9"
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
          {shown.map(({ customer, bookings }) => (
            <Dialog key={customer.id}>
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
                          <Phone className="size-3.5" /> {customer.phone}
                        </span>
                        {customer.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="size-3.5" /> {customer.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {bookings.length} {bookings.length === 1 ? "reserva" : "reservas"}
                    </Badge>
                  </button>
                }
              >
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{customer.name}</DialogTitle>
                    <DialogDescription>
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3.5" /> {customer.phone}
                      </span>
                      {customer.email && (
                        <span className="ml-3 inline-flex items-center gap-1">
                          <Mail className="size-3.5" /> {customer.email}
                        </span>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <HistoryList bookings={bookings} />
                </DialogContent>
              </DialogTrigger>
            </Dialog>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryList({
  bookings,
}: {
  bookings: CustomerHistory["bookings"];
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
                {formatWhen(booking.start_at)}
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
      Nenhum cliente encontrado para “{query}”.
    </div>
  );
}
