"use client";

import { useEffect } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// A failed lookup on a page that exists must never read as "page not found"
// (#197). This boundary sits under the public layout, so the footer stays and
// the global-error screen is kept for failures outside the segment.
export default function PublicPageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Registra apenas o digest; a mensagem pode conter dados sensíveis.
    console.error("Falha ao carregar a página pública", error.digest ?? "sem-digest");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <div role="alert" className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <Clock3 className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Não foi possível carregar os horários agora</h1>
        <p className="mt-3 text-sm text-muted-foreground">Foi uma falha temporária. Tente novamente em instantes.</p>
        <Button type="button" className="mt-6" onClick={() => retry()}>
          <RefreshCw aria-hidden />
          Tentar novamente
        </Button>
      </div>
    </main>
  );
}
