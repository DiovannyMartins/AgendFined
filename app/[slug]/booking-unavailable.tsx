import { CalendarOff } from "lucide-react";

// Shown instead of the booking form while the negócio cannot take reservas:
// without an active serviço or without any faixa of disponibilidade recorrente,
// the form would only offer an empty select or dates with no horários.
const COPY = {
  no_services: {
    title: "Este negócio ainda não está recebendo reservas online",
    description: "Os serviços ainda não foram cadastrados. Volte mais tarde ou fale diretamente com o negócio.",
  },
  no_availability: {
    title: "Ainda não há horários configurados",
    description:
      "Este negócio ainda não definiu os horários de atendimento para reservas online. Volte mais tarde ou fale diretamente com o negócio.",
  },
} as const;

export function BookingUnavailable({ reason }: { reason: keyof typeof COPY }) {
  const { title, description } = COPY[reason];
  return (
    <section
      aria-labelledby="booking-unavailable-title"
      className="mx-auto max-w-2xl rounded-2xl border border-border bg-background p-8 text-center shadow-sm"
    >
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarOff className="size-6" aria-hidden="true" />
      </div>
      <h2 id="booking-unavailable-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
