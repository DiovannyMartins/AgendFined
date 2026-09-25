import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaPanel } from "./mfa-panel";

export default async function MfaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-4 py-12">
      <MfaPanel factorId={data.totp.find((factor) => factor.status === "verified")?.id ?? null} verified={assurance.currentLevel === "aal2"} />
    </main>
  );
}
