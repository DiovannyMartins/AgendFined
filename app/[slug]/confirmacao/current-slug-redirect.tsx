"use client";

import { useEffect } from "react";
import { moveConfirmationToSlug } from "@/lib/bookings/private-confirmation";

// The negócio changed its slug after the link was sent (#124). A server redirect
// rendered inside the streamed Suspense boundary becomes a client navigation that
// drops the fragment, and with it the cancel capability, so the move happens here
// from the full browser URL.
export function CurrentSlugRedirect({ slug, code }: { slug: string; code: string }) {
  useEffect(() => {
    window.location.replace(moveConfirmationToSlug(window.location.href, slug));
  }, [slug]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <p className="text-center text-muted-foreground">
        Este negócio mudou de endereço.{" "}
        <a
          href={`/${encodeURIComponent(slug)}/confirmacao?${new URLSearchParams({ code }).toString()}`}
          className="font-medium text-foreground hover:underline"
        >
          Abrir a reserva
        </a>
      </p>
    </main>
  );
}
