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
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

const INITIAL: CancelState = { status: "idle" };

// The token is an independent private capability issued once at creation. The
// public booking code alone cannot reproduce it.
export function CancelBooking({
  code,
  token,
  confirmationEmailSent = true,
  onCancelled,
}: {
  code: string;
  token: string;
  confirmationEmailSent?: boolean;
  onCancelled?: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prev: CancelState, formData: FormData) => {
    const next = await cancelPublicBooking(prev, formData);
    if (next.status === "done") onCancelled?.();
    return next;
  }, INITIAL);

  if (state.status === "done") {
    return (
      <div role="status" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
        <p className="text-sm font-medium">Reserva cancelada!</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O horário foi liberado e poderá ser reservado novamente.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      {/* #187: without the e-mail there is no later link, so the cliente is
          told up front that this button is the last self-service chance. */}
      {!confirmationEmailSent && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-left text-sm font-normal">
          <p className="font-medium">Não conseguimos enviar o e-mail de confirmação.</p>
          <p className="mt-1 text-muted-foreground">
            Sua reserva está confirmada, mas você não vai receber o link para cancelar depois. Se precisar,
            cancele agora por este botão. Depois de sair desta página, para cancelar, fale com o
            negócio.
          </p>
        </div>
      )}
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
          <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <label htmlFor="cancelReason" className="text-sm font-medium">
                Motivo (opcional)
              </label>
              <Input id="cancelReason" name="cancelReason" maxLength={250} />
            </div>
            {state.status === "error" && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
            <Button type="submit" variant="destructive" disabled={pending} className="w-full">
              {pending ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {/* ADR 0005: the token is delivered once and scrubbed from the URL, so
          the button does not come back after leaving or reloading the page. */}
      {confirmationEmailSent && (
        <p className="mt-2 text-xs text-muted-foreground">
          Este botão não aparece de novo se você sair ou recarregar a página. Para cancelar depois,
          use o link do e-mail de confirmação.
        </p>
      )}
    </div>
  );
}
