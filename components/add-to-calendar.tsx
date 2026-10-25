import { CalendarPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { CalendarLinks } from "@/lib/gcal/customer-event";

// "Adicionar à minha agenda" (#196), on the confirmation and the consulta. The .ics link carries no `download`
// attribute: iOS Safari would save the file to Downloads instead of handing it
// to Calendar, while Chrome on Android downloads a text/calendar response
// anyway and opens it in the phone's calendar.
export function AddToCalendar({ icsHref, googleHref }: CalendarLinks) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <a href={icsHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
        <CalendarPlus />
        Adicionar à minha agenda
      </a>
      <a
        href={googleHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
      >
        Adicionar ao Google Agenda
      </a>
    </div>
  );
}
