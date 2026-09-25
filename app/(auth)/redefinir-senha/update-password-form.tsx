"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@/lib/validation/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updatePassword, type ActionResult } from "@/lib/auth/actions";

const INITIAL: ActionResult = { ok: true, data: undefined };

const schema = z.object({ password: passwordSchema });
type Values = z.infer<typeof schema>;

export function UpdatePasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const done = submitted && state.ok;

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => router.push("/dashboard"), 1500);
      return () => clearTimeout(t);
    }
  }, [done, router]);

  function onSubmit(values: Values) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("password", values.password);
      const result = await updatePassword(INITIAL, fd);
      setState(result);
      setSubmitted(true);
    });
  }

  const serverError = state.ok ? "" : state.message;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Redefinir senha</CardTitle>
        <CardDescription>Escolha uma nova senha para sua conta.</CardDescription>
      </CardHeader>
      <CardContent>
        {done && !pending ? (
          <div className="space-y-3 text-center text-sm">
            <p className="font-medium">Senha atualizada!</p>
            <p className="text-muted-foreground">Redirecionando para o painel...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Nova senha
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={15}
                {...register("password")}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
