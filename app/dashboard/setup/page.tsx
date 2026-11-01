import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business/queries";
import { BusinessForm } from "../configuracoes/business-form";

export const metadata: Metadata = { title: "Configurar negócio — AgendFined" };

export default async function SetupPage() {
  if (await getCurrentBusiness()) redirect("/dashboard");

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo! 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure seu negócio para gerar sua página pública de agendamento. Ao criar o negócio, começam
          seus 30 dias de teste grátis, sem cartão (um teste por pessoa).
        </p>
      </div>
      <BusinessForm initial={null} />
    </div>
  );
}
