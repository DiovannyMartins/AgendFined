import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Reveal } from "@/components/reveal";
import { SignupForm } from "./signup-form";

export default function CadastroPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
      <Reveal variant="down">
        <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
          <BrandLogo />
        </Link>
      </Reveal>
      <Reveal delay={80} className="w-full max-w-md">
        <SignupForm />
      </Reveal>
      <Reveal delay={160}>
        <p className="mt-6 text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Entrar
          </Link>
        </p>
      </Reveal>
    </div>
  );
}
