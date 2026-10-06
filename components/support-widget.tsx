"use client";

import { HelpCircle, Mail } from "lucide-react";
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
const supportComposeUrl =
  "https://outlook.live.com/mail/0/deeplink/compose?to=agendfined%40outlook.com&subject=Suporte%20AgendFined";

export function SupportWidget() {
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
            Encontre uma orientação rápida ou fale diretamente com o suporte do AgendFined.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <a
            href={supportComposeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
          >
            <Mail className="mt-0.5 size-4 text-primary" />
            <span>
              <span className="block text-sm font-medium">Falar com o suporte</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{supportEmail} · dúvidas ou problemas</span>
            </span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
