import { BusinessForm } from "../configuracoes/business-form";

export default async function SetupPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo! 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure seu negócio para gerar sua página pública de agendamento.
        </p>
      </div>
      <BusinessForm initial={null} />
    </div>
  );
}
