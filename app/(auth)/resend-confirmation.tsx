"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendSignupConfirmation, type ActionResult } from "@/lib/auth/actions";
import type { useAuthTurnstile } from "@/components/auth-turnstile";

const INITIAL: ActionResult = { ok: true, data: undefined };

// Supabase Auth refuses another confirmation e-mail for about a minute after
// the signup or the last send (max_frequency = "1m"), and the neutral answer
// cannot say so. Waiting here keeps a click in that minute from looking like a
// new e-mail went out (#179).
export const RESEND_COOLDOWN_SECONDS = 60;

// The parent renders the Turnstile widget (one per page); this button only
// spends its token and asks for a fresh one afterwards.
export function ResendConfirmation({
  email,
  captcha,
  label,
  justSent = false,
}: {
  email: string;
  captcha: ReturnType<typeof useAuthTurnstile>;
  label: string;
  // The signup itself has just sent the first e-mail.
  justSent?: boolean;
}) {
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [waitUntil, setWaitUntil] = useState(() => (justSent ? Date.now() + RESEND_COOLDOWN_SECONDS * 1000 : 0));
  const remainingSeconds = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  useEffect(() => {
    if (remainingSeconds === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds]);

  function resend() {
    setState(INITIAL);
    setSent(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("cfTurnstileToken", captcha.token);
      const result = await resendSignupConfirmation(INITIAL, fd);
      setState(result);
      setSent(result.ok);
      if (result.ok) {
        const sentAt = Date.now();
        setNow(sentAt);
        setWaitUntil(sentAt + RESEND_COOLDOWN_SECONDS * 1000);
      }
      captcha.renew();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={resend}
        disabled={pending || remainingSeconds > 0 || !captcha.canSubmit}
      >
        {pending ? "Reenviando..." : remainingSeconds > 0 ? `Reenviar em ${remainingSeconds} s` : label}
      </Button>
      <div aria-live="polite">
        {sent && (
          <p className="text-sm text-muted-foreground">
            Se houver um cadastro aguardando confirmação com esse e-mail, enviamos um novo link. Confira
            também a caixa de spam. Se não chegar em alguns minutos, peça de novo quando o botão liberar.
          </p>
        )}
        {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      </div>
    </div>
  );
}
