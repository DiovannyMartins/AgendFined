import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha — AgendFined" };

export default function RecuperarSenhaPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <BrandLogo />
      </Link>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Lembrou a senha?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
