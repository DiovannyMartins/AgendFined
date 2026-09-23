"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelPublicBooking, type CancelState } from "@/lib/booking/actions";

const INITIAL: CancelState = { status: "idle" };

// The token is an independent private capability issued once at creation. The
// public booking code alone cannot reproduce it.
export function CancelBooking({ code, token }: { code: string; token: string }) {
  const [state, formAction, pending] = useActionState(cancelPublicBooking, INITIAL);

  if (state.status === "done") {
    return (
      <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
        <p className="text-sm font-medium">Reserva cancelada!</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O horário foi liberado e poderá ser reservado novamente.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      <Dialog>
        <DialogTrigger render={<Button type="button" variant="ghost" className="text-destructive" />}>
          Cancelar reserva
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar reserva</DialogTitle>
            <DialogDescription>
              Ao confirmar, esta reserva será cancelada e o horário voltará a ficar disponível.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <label htmlFor="cancelReason" className="text-sm font-medium">
                Motivo (opcional)
              </label>
              <Input id="cancelReason" name="cancelReason" maxLength={250} />
            </div>
            {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
            <Button type="submit" variant="destructive" disabled={pending} className="w-full">
              {pending ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
