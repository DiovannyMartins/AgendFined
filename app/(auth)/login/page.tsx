import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Reveal } from "@/components/reveal";
import { LoginForm } from "./login-form";

// Erros que chegam por query string (ex.: /auth/callback quando o link de
// confirmação é aberto em outro navegador ou já expirou).
const NOTICES: Record<string, string> = {
  auth: "Não conseguimos concluir o acesso por este link. Seu e-mail pode já ter sido confirmado: entre com seu e-mail e senha para continuar.",
};

export const metadata: Metadata = { title: "Entrar — AgendFined" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const notice = error ? NOTICES[error] : undefined;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
      <Reveal variant="down">
        <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
          <BrandLogo />
        </Link>
      </Reveal>
      <Reveal delay={80} className="w-full max-w-md">
        <LoginForm notice={notice} />
      </Reveal>
      <Reveal delay={160}>
        <p className="mt-6 text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-foreground hover:underline">
            Cadastre-se grátis
          </Link>
        </p>
      </Reveal>
    </div>
  );
}
