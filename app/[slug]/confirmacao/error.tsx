"use client";

import { useEffect } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONFIRMATION_RATE_LIMITED } from "./confirmation-errors";

// A booking that was already recorded must never read as "page not found"
// (#140): a refused or failed lookup tells the customer to wait or retry.
// retry() refetches the page without touching the URL, so a #cancel token
// from the e-mail link is still there for the next attempt.
export default function ConfirmationError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const rateLimited = error.digest === CONFIRMATION_RATE_LIMITED;

  useEffect(() => {
    // Registra apenas o digest; a mensagem pode conter dados sensíveis.
    console.error("Falha ao carregar a confirmação", error.digest ?? "sem-digest");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <div role="alert" className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <Clock3 className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">
          {rateLimited ? "Muitas consultas seguidas" : "Não foi possível carregar sua reserva agora"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {rateLimited
            ? "Aguarde alguns minutos e recarregue. Sua reserva não foi afetada."
            : "Foi uma falha temporária. Sua reserva não foi afetada."}
        </p>
        <Button type="button" className="mt-6" onClick={() => retry()}>
          <RefreshCw aria-hidden />
          Tentar novamente
        </Button>
      </div>
    </main>
  );
}
