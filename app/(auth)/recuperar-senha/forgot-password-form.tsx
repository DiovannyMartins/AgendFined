"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestPasswordReset, type ActionResult } from "@/lib/auth/actions";

const INITIAL: ActionResult = { ok: true, data: undefined };

const schema = z.object({ email: z.string().trim().email("Informe um e-mail válido.") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const done = submitted && state.ok;
  const serverError = state.ok ? "" : state.message;

  function onSubmit(values: Values) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", values.email);
      const result = await requestPasswordReset(INITIAL, fd);
      setState(result);
      setSubmitted(true);
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle role="heading" aria-level={1} className="text-2xl">Recuperar senha</CardTitle>
        <CardDescription>Enviaremos um link seguro para redefinir sua senha.</CardDescription>
      </CardHeader>
      <CardContent>
        {done && !pending ? (
          <div className="space-y-3 text-center text-sm">
            <p className="font-medium">E-mail enviado!</p>
            <p className="text-muted-foreground">
              Se existir uma conta com esse e-mail, você receberá o link de recuperação.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Enviando..." : "Enviar link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
