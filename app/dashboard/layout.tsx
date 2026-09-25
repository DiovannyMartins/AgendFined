import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { DashboardNav } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2")) {
    redirect("/mfa");
  }

  const business = await getCurrentBusiness();

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] flex-col gap-8 px-4 py-8 lg:px-6">
      <DashboardNav slug={business?.slug ?? null} />
      <div className="flex-1">{children}</div>
      <p className="text-xs text-muted-foreground">
        {business ? `Negócio: ${business.slug}` : "Configuração pendente"}
      </p>
    </div>
  );
}
