import { BusinessForm } from "../configuracoes/business-form";
import { createClient } from "@/lib/supabase/server";

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Bem-vindo! 🎉</h1>
        <p className="mt-2 text-muted-foreground">
          Configure seu negócio para gerar sua página pública de agendamento.
        </p>
      </div>
      {user && (
        <p className="mb-6 text-sm text-muted-foreground">
          Vai participar de um negócio existente? Compartilhe seu ID de usuário com o administrador:
          {" "}<code className="break-all">{user.id}</code>
        </p>
      )}
      <BusinessForm initial={null} />
    </div>
  );
}
