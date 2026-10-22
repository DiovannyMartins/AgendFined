"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendSignupConfirmation, type ActionResult } from "@/lib/auth/actions";
import type { useAuthTurnstile } from "@/components/auth-turnstile";

const INITIAL: ActionResult = { ok: true, data: undefined };

// The parent renders the Turnstile widget (one per page); this button only
// spends its token and asks for a fresh one afterwards.
export function ResendConfirmation({
  email,
  captcha,
  label,
}: {
  email: string;
  captcha: ReturnType<typeof useAuthTurnstile>;
  label: string;
}) {
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

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
        disabled={pending || !captcha.canSubmit}
      >
        {pending ? "Reenviando..." : label}
      </Button>
      <div aria-live="polite">
        {sent && (
          <p className="text-sm text-muted-foreground">
            Se houver um cadastro aguardando confirmação com esse e-mail, enviamos um novo link. Confira
            também a caixa de spam.
          </p>
        )}
        {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      </div>
    </div>
  );
}
