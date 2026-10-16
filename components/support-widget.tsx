"use client";

import { useState } from "react";
import { Check, Copy, HelpCircle, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const supportEmail = "agendfined@outlook.com";
const supportSubject = "Suporte AgendFined";

const to = encodeURIComponent(supportEmail);
const subject = encodeURIComponent(supportSubject);

// Clients use different providers, so we offer the common webmails plus the
// device's default app (mailto) instead of forcing a single one.
const emailOptions = [
  {
    label: "Abrir no Gmail",
    href: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}`,
    external: true,
  },
  {
    label: "Abrir no Outlook",
    href: `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}`,
    external: true,
  },
  {
    label: "Outro app de e-mail",
    href: `mailto:${supportEmail}?subject=${subject}`,
    external: false,
  },
];

export function SupportWidget() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(supportEmail);
    } catch {
      const el = document.createElement("textarea");
      el.value = supportEmail;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="fixed right-4 bottom-4 z-40 gap-2 rounded-full bg-background/95 shadow-lg backdrop-blur sm:right-6 sm:bottom-6"
          />
        }
      >
        <HelpCircle className="size-4" />
        <span>Suporte</span>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como podemos ajudar?</DialogTitle>
          <DialogDescription>
            Fale com o suporte do AgendFined por e-mail sobre dúvidas ou problemas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="flex min-w-0 items-center gap-3">
              <Mail className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">{supportEmail}</span>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={copyEmail} aria-live="polite">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>

          <div className="grid gap-2">
            {emailOptions.map((option) => (
              <a
                key={option.label}
                href={option.href}
                {...(option.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="rounded-lg border border-border p-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                {option.label}
              </a>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
