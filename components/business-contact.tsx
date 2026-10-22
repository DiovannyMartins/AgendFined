import { formatPhoneBR, phoneTelHref, whatsappHref } from "@/lib/format/phone";

// The negócio's phone on the confirmation and the consulta: the cliente can
// call or open WhatsApp with one tap instead of copying the number (#149).
export function BusinessPhone({ phone }: { phone: string }) {
  const tel = phoneTelHref(phone);
  const whatsapp = whatsappHref(phone);
  if (!tel) return <p className="text-sm text-muted-foreground">{formatPhoneBR(phone)}</p>;

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <a href={tel} className="text-muted-foreground underline hover:text-foreground">
        {formatPhoneBR(phone)}
      </a>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline"
        >
          Chamar no WhatsApp
        </a>
      )}
    </p>
  );
}
