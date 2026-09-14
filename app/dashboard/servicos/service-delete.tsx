"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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
import { deleteService, type ActionResult } from "@/lib/services/actions";

const INITIAL: ActionResult = { ok: true, data: undefined };

export function ServiceDelete({
  id,
  name,
  hasHistory = false,
  bookingCount = 0,
  hasScheduled = false,
  scheduledCount = 0,
}: {
  id: string;
  name: string;
  hasHistory?: boolean;
  bookingCount?: number;
  hasScheduled?: boolean;
  scheduledCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(INITIAL);
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Excluir serviço" />}
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir serviço</DialogTitle>
          <DialogDescription>
            {hasScheduled ? (
              <>
                &quot;{name}&quot; possui{" "}
                {scheduledCount > 0
                  ? `${scheduledCount} reserva${scheduledCount === 1 ? "" : "s"} agendada${scheduledCount === 1 ? "" : "s"}`
                  : "reservas agendadas"}{" "}
                e não pode ser excluído. Cancele ou conclua as reservas agendadas
                antes de excluir.
              </>
            ) : (
              <>
                Tem certeza que deseja excluir &quot;{name}&quot;? Esta ação não pode ser
                desfeita.
                {hasHistory && (
                  <>
                    {" "}
                    {bookingCount > 0
                      ? `${bookingCount} reserva${bookingCount === 1 ? "" : "s"} desse serviço
                    será mantida no histórico (agenda, clientes e relatórios).`
                      : "As reservas desse serviço serão mantidas no histórico (agenda, clientes e relatórios)."}
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {hasScheduled ? "Fechar" : "Cancelar"}
          </Button>
          {!hasScheduled && (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteService(id);
                  setState(result);
                  if (result.ok) setOpen(false);
                })
              }
            >
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
