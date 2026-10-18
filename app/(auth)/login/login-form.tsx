"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login, type ActionResult } from "@/lib/auth/actions";
import { useAuthTurnstile } from "@/components/auth-turnstile";
import { loginSchema, type LoginInput } from "@/lib/validation/schemas";

const INITIAL: ActionResult = { ok: true, data: undefined };

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [pending, startTransition] = useTransition();
  const captcha = useAuthTurnstile();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function onSubmit(values: LoginInput) {
    setState(INITIAL);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", values.email);
      fd.set("password", values.password);
      fd.set("cfTurnstileToken", captcha.token);
      if (next) fd.set("next", next);
      const result = await login(INITIAL, fd);
      setState(result);
      captcha.renew();
    });
  }

  const error = state.ok ? "" : state.message;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle role="heading" aria-level={1} className="text-2xl">Entrar</CardTitle>
        <CardDescription>Acesse seu painel do AgendFined.</CardDescription>
      </CardHeader>
      <CardContent>
        {notice && (
          <p role="status" className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">
            {notice}
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          {captcha.widget}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending || !captcha.canSubmit}>
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/recuperar-senha" className="hover:underline">
            Esqueceu a senha?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
