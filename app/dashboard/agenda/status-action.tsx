"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateBookingStatus } from "@/lib/bookings/actions";
import { isTooEarlyFor } from "@/lib/bookings/transitions";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

const INITIAL: { ok: boolean; message?: string } = { ok: true };
export function StatusAction({ id, status, startAt }: { id: string; status: string; startAt: string }) {
  // Keyed by status so the dialog closes once the correction lands.
  if (status === "completed" || status === "no_show") return <CorrectionDialog key={status} id={id} status={status} />;
  if (status !== "confirmed") return null;

  // Concluir and No-show only make sense once the reserva has started (#78);
  // the server enforces the same rule.
  const started = !isTooEarlyFor("completed", startAt, new Date());

  return (
    <div className="flex items-center gap-2">
      <OutcomeDialog
        id={id}
        status="completed"
        started={started}
        label="Concluir"
        variant="secondary"
        title="Concluir reserva"
        description="A reserva será marcada como concluída. Se for engano, use Corrigir status para trocar por no-show."
        confirmLabel="Confirmar conclusão"
      />
      <OutcomeDialog
        id={id}
        status="no_show"
        started={started}
        label="No-show"
        variant="outline"
        title="Marcar no-show"
        description="A reserva será marcada como no-show (o cliente não compareceu). Se for engano, use Corrigir status para trocar por concluída."
        confirmLabel="Confirmar no-show"
      />
      <CancelDialog id={id} />
    </div>
  );
}

function OutcomeDialog({
  id,
  status,
  started,
  label,
  variant,
  title,
  description,
  confirmLabel,
}: {
  id: string;
  status: "completed" | "no_show";
  started: boolean;
  label: string;
  variant: "secondary" | "outline";
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(updateBookingStatus, INITIAL);

  if (!started) {
    // Disabled buttons don't fire hover events, so the hint lives on a wrapper.
    return (
      <span title="Disponível após o início">
        <Button size="sm" variant={variant} disabled>
          {label}
        </Button>
      </span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant={variant} />}>{label}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={status} />
          {state.ok === false && <p className="text-sm text-destructive">{state.message}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// completed and no_show can be corrected into each other (#145): the
// appointment already happened, only its desfecho changes.
const CORRECTION = {
  completed: {
    nextStatus: "no_show",
    description: "A reserva está como concluída. Se o cliente não compareceu, marque como no-show.",
    confirmLabel: "Marcar como no-show",
  },
  no_show: {
    nextStatus: "completed",
    description: "A reserva está como no-show. Se o cliente foi atendido, marque como concluída.",
    confirmLabel: "Marcar como concluída",
  },
} as const;

function CorrectionDialog({ id, status }: { id: string; status: keyof typeof CORRECTION }) {
  const [state, formAction, pending] = useActionState(updateBookingStatus, INITIAL);
  const correction = CORRECTION[status];

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Corrigir status</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Corrigir status</DialogTitle>
          <DialogDescription>{correction.description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={correction.nextStatus} />
          {state.ok === false && <p className="text-sm text-destructive">{state.message}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : correction.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(updateBookingStatus, INITIAL);

  return (
    <Dialog>
      <DialogTrigger
        render={<Button size="sm" variant="outline" className="text-destructive" />}
      >
        Cancelar
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar reserva</DialogTitle>
          <DialogDescription>
            A reserva será cancelada e o horário voltará a ficar disponível.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="cancelled" />
          <div className="space-y-2">
            <label htmlFor={`reason-${id}`} className="text-sm font-medium">
              Motivo (opcional)
            </label>
            <Input id={`reason-${id}`} name="cancelReason" maxLength={250} />
          </div>
          {state.ok === false && <p className="text-sm text-destructive">{state.message}</p>}
          <Button type="submit" variant="destructive" disabled={pending} className="w-full">
            {pending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
