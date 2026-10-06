"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitInterest, type InterestActionResult } from "@/lib/marketing/actions";

const INITIAL: InterestActionResult = { ok: true, data: undefined };

export function InterestForm() {
  const [state, setState] = useState<InterestActionResult>(INITIAL);
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(true);

  const onToken = useCallback((token: string) => setTurnstileToken(token), []);
  const onState = useCallback((ready: boolean) => setTurnstileReady(ready), []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("cfTurnstileToken", turnstileToken);
    setPending(true);
    void submitInterest(INITIAL, formData).then((result) => {
      setState(result);
      setPending(false);
      if (result.ok) form.reset();
    });
  }

  if (state.ok && !pending && state !== INITIAL) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-background/70 p-8 text-center">
        <p className="text-lg font-medium">Inscrição recebida.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enviamos uma confirmação para seu e-mail. Entraremos em contato apenas quando houver novidades relevantes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto grid max-w-xl gap-4" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="interest-email" className="sr-only">Seu e-mail</label>
          <Input
            id="interest-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            required
            className="h-12 rounded-full bg-background/80 px-5"
          />
        </div>
        <Button type="submit" className="h-12 rounded-full px-6" disabled={pending || !turnstileReady}>
          {pending ? "Enviando..." : "Quero saber mais"}
          {!pending && <ArrowRight className="size-4" />}
        </Button>
      </div>

      <label className="flex items-start gap-3 text-left text-xs leading-relaxed text-muted-foreground">
        <input name="consent" type="checkbox" required className="mt-0.5 size-4 accent-primary" />
        <span>Autorizo o AgendFined a usar meu e-mail para responder sobre novidades e o lançamento.</span>
      </label>

      <input
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px overflow-hidden"
      />
      <TurnstileWidget action="interest_signup" onToken={onToken} onState={onState} />
      {!state.ok && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    </form>
  );
}
