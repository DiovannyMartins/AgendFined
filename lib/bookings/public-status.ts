import type { BookingStatus } from "@/lib/bookings/transitions";

export type PublicStatusTone = "success" | "danger" | "neutral" | "warning";

// What the cliente sees: the reserva status, except that a confirmed reserva
// whose start_at has passed is no longer a guaranteed slot. The cliente can no
// longer cancel it; completed or no_show is the negócio's call (#141).
export type PublicStatusView = BookingStatus | "started";

export function publicStatusView(status: BookingStatus, started: boolean): PublicStatusView {
  return status === "confirmed" && started ? "started" : status;
}

export const BOOKING_ALREADY_STARTED_MESSAGE = "Este horário já passou. Fale com o negócio.";

// What the customer-facing confirmation/consult screens say for each reserva
// status. Only a confirmed booking may be presented as a guaranteed slot: a
// cancelled one must warn that the slot was freed (issue #110).
export const PUBLIC_STATUS_COPY: Record<PublicStatusView, { title: string; description: string; tone: PublicStatusTone }> = {
  confirmed: {
    title: "Reserva confirmada!",
    description: "Você recebeu um horário garantido. Mostre esta confirmação na sua visita.",
    tone: "success",
  },
  started: {
    title: "Este horário já passou",
    description: "Não é mais possível cancelar esta reserva por aqui. Se precisar, fale com o negócio.",
    tone: "neutral",
  },
  cancelled: {
    title: "Reserva cancelada",
    description:
      "Esta reserva foi cancelada e o horário foi liberado, podendo ser reservado por outra pessoa. Não compareça neste horário; se quiser, faça uma nova reserva.",
    tone: "danger",
  },
  completed: {
    title: "Reserva concluída",
    description: "Este atendimento já foi realizado. Obrigado pela visita!",
    tone: "neutral",
  },
  no_show: {
    title: "Não comparecimento registrado",
    description: "O negócio registrou que você não compareceu a este horário. Para voltar, faça uma nova reserva.",
    tone: "warning",
  },
};

export function publicDocumentTitle(status: PublicStatusView): string {
  return `${PUBLIC_STATUS_COPY[status].title.replace(/!$/, "")} — AgendFined`;
}

// Label above the public code. Only a reserva that still happens is worth
// keeping the code for; a cancelled or finished one just identifies it.
export function publicCodeHint(status: PublicStatusView): string {
  return status === "confirmed" ? "Guarde o código da sua reserva" : "Código da reserva";
}
