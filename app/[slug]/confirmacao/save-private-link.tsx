"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPublicCode } from "@/lib/bookings/public-code";

// The private link is delivered once (ADR 0005). When no e-mail carries it
// (#187, #195), the cliente keeps it here: copied, or sent to their own
// WhatsApp. wa.me without a number lets them pick the chat, their own included.
export function SavePrivateLink({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const whatsappText = `Minha reserva (código ${formatPublicCode(code)}). Para ver, remarcar ou cancelar: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        <Copy className="size-4" />
        {copied ? "Link copiado!" : "Copiar link da reserva"}
      </Button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        <MessageCircle className="size-4" />
        Enviar para o meu WhatsApp
      </a>
    </div>
  );
}
