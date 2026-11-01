"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelSubscription } from "@/lib/billing/actions";

// "Cancelar assinatura" CTA for the "Plano" section (US16). A misclick would
// stop the charges in Mercado Pago and only a new checkout brings them back, so
// it asks first and says until when the access lasts (issue
// #151). `activeUntil` is the server's preview: the action reads the paid
// period from Mercado Pago before cancelling (ADR 0008), so without a local
// next charge date only the 7-day minimum is promised. On success the server
// component is refreshed to reflect the new status.
export function CancelSubscriptionButton({
  activeUntil,
}: {
  activeUntil: { date: string; atLeast: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSubscription();
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        Cancelar assinatura
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar assinatura?</DialogTitle>
          <DialogDescription>
            As novas cobranças no Mercado Pago param.{" "}
            {activeUntil.atLeast
              ? `Seu acesso continua até o fim do mês já pago, no mínimo até ${activeUntil.date}.`
              : `Seu acesso continua até ${activeUntil.date}.`}{" "}
            Depois, o negócio fica suspenso, sem perder dados.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Manter assinatura
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
