"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { leaveWaitlist, type LeaveWaitlistState } from "@/lib/booking/actions";
import { readWaitlistLeaveToken } from "@/lib/waitlist/leave-link";

const INITIAL: LeaveWaitlistState = { status: "idle" };

// The capability arrives in the fragment of the e-mail link (#152). It is
// captured once and scrubbed from the URL, like the reserva's private link
// (ADR 0005), so copies and screenshots of the page do not carry it.
export function LeaveWaitlist({ slug }: { slug: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [state, formAction, pending] = useActionState(leaveWaitlist, INITIAL);

  useEffect(() => {
    let active = true;
    const captureCapability = () => {
      if (!active) return;
      // A later fragment-only navigation (the e-mail link opened again in this
      // tab) does not remount the page, so it is captured here too.
      const next = readWaitlistLeaveToken(window.location.hash);
      setToken((current) => next ?? current ?? null);
      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
    };
    queueMicrotask(captureCapability);
    window.addEventListener("hashchange", captureCapability);
    return () => {
      active = false;
      window.removeEventListener("hashchange", captureCapability);
    };
  }, []);

  const backLink = (
    <Link href={`/${slug}`} className="mt-6 inline-block text-sm font-medium hover:underline">
      ← Ver horários disponíveis
    </Link>
  );

  if (state.status === "done") {
    return (
      <div role="status">
        <h1 className="text-xl font-semibold">Você saiu da lista de espera</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você não receberá mais avisos sobre este horário.
        </p>
        {backLink}
      </div>
    );
  }

  if (token === undefined) return null;

  if (token === null) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Link inválido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para sair da lista de espera, abra o link do e-mail que você recebeu ao entrar nela.
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Sair da lista de espera</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ao confirmar, você deixa de esperar por este horário e não receberá mais avisos sobre ele.
      </p>
      <form action={formAction} className="mt-6 space-y-3">
        <input type="hidden" name="token" value={token} />
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        <Button type="submit" variant="destructive" disabled={pending} className="w-full">
          {pending ? "Saindo..." : "Sair da lista de espera"}
        </Button>
      </form>
      {backLink}
    </div>
  );
}
