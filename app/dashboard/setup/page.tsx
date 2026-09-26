import { BusinessForm } from "../configuracoes/business-form";

export default async function SetupPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Bem-vindo! 🎉</h1>
        <p className="mt-2 text-muted-foreground">
          Configure seu negócio para gerar sua página pública de agendamento.
        </p>
      </div>
      <BusinessForm initial={null} />
    </div>
  );
}
