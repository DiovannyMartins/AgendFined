import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mfaChallengePath, requiresMfaChallenge } from "@/lib/auth/assurance";
import { UpdatePasswordForm } from "./update-password-form";

export default async function RedefinirSenhaPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login?next=%2Fredefinir-senha");

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (requiresMfaChallenge(assurance)) redirect(mfaChallengePath("/redefinir-senha"));

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <BrandLogo />
      </Link>
      <UpdatePasswordForm />
    </div>
  );
}
