"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signup, type ActionResult } from "@/lib/auth/actions";
import { useAuthTurnstile } from "@/components/auth-turnstile";
import { signupSchema, type SignupInput } from "@/lib/validation/schemas";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { ResendConfirmation } from "../resend-confirmation";

const INITIAL: ActionResult = { ok: true, data: undefined };

export function SignupForm() {
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const captcha = useAuthTurnstile();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  function onSubmit(values: SignupInput) {
    setSubmittedEmail(values.email);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("displayName", values.displayName);
      fd.set("email", values.email);
      fd.set("password", values.password);
      fd.set("cfTurnstileToken", captcha.token);
      const result = await signup(INITIAL, fd);
      setState(result);
      const passwordError = result.ok ? undefined : result.fieldErrors?.password?.[0];
      if (passwordError) setError("password", { message: passwordError });
      captcha.renew();
      setSubmitted(true);
      if (result.ok) trackAnalyticsEvent("sign_up", { method: "email" });
    });
  }

  const done = submitted && state.ok;
  const error = state.ok ? "" : state.message;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle role="heading" aria-level={1} className="text-2xl">Criar conta</CardTitle>
        <CardDescription>Comece a receber reservas grátis.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-3 text-center text-sm">
            <p className="font-medium">Conta criada com sucesso!</p>
            <p className="text-muted-foreground">
              Verifique seu e-mail para confirmar o cadastro e depois faça login.
            </p>
            {/* With confirmations on, Supabase answers an existing e-mail with
                the same success and sends nothing, so point those owners to
                login and recovery instead. */}
            <p className="text-muted-foreground">
              Já tinha conta com esse e-mail?{" "}
              <Link href="/login" className="underline underline-offset-4">
                Entre
              </Link>{" "}
              ou{" "}
              <Link href="/recuperar-senha" className="underline underline-offset-4">
                recupere a senha
              </Link>
              .
            </p>
            {captcha.widget}
            <ResendConfirmation email={submittedEmail} captcha={captcha} label="Não recebeu o e-mail? Reenviar" justSent />
          </div>
        ) : (
          <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Como quer ser chamado?
              </label>
              <Input id="displayName" autoComplete="name" {...register("displayName")} />
              {errors.displayName && (
                <p className="text-sm text-destructive">{errors.displayName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                {...register("password")}
              />
              <p className="text-xs text-muted-foreground">
                Use pelo menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo.
              </p>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Ao criar a conta você concorda com nossos Termos e Política de Privacidade.
            </p>
            {captcha.widget}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending || !captcha.canSubmit}>
              {pending ? "Criando..." : "Começar grátis"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
