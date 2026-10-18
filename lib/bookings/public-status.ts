import type { BookingStatus } from "@/lib/bookings/transitions";

export type PublicStatusTone = "success" | "danger" | "neutral" | "warning";

// What the customer-facing confirmation/consult screens say for each reserva
// status. Only a confirmed booking may be presented as a guaranteed slot: a
// cancelled one must warn that the slot was freed (issue #110).
export const PUBLIC_STATUS_COPY: Record<BookingStatus, { title: string; description: string; tone: PublicStatusTone }> = {
  confirmed: {
    title: "Reserva confirmada!",
    description: "Você recebeu um horário garantido. Mostre esta confirmação na sua visita.",
    tone: "success",
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

export function publicDocumentTitle(status: BookingStatus): string {
  return `${PUBLIC_STATUS_COPY[status].title.replace(/!$/, "")} — AgendFined`;
}
