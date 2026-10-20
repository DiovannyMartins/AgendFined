import { CalendarOff, MessageCircle, Phone } from "lucide-react";
import { brazilianPhoneSchema } from "@/lib/validation/schemas";
import { formatPhoneBR } from "@/lib/format/phone";

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

export function BookingUnavailable({ reason, phone }: { reason: keyof typeof COPY; phone?: string | null }) {
  const { title, description } = COPY[reason];
  // "Fale diretamente com o negócio" needs a way to do it: the phone the
  // negócio registered, as a call link and a WhatsApp link.
  const national = phone ? brazilianPhoneSchema.safeParse(phone) : null;
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
      {national?.success && (
        <div className="mt-5 flex flex-col items-center justify-center gap-2 text-sm font-medium sm:flex-row sm:gap-4">
          <a
            href={`tel:+55${national.data}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 hover:underline"
          >
            <Phone className="size-4" aria-hidden="true" />
            {formatPhoneBR(national.data)}
          </a>
          <a
            href={`https://wa.me/55${national.data}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 hover:underline"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Conversar no WhatsApp
          </a>
        </div>
      )}
    </section>
  );
}
