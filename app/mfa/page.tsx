import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaPanel } from "./mfa-panel";
import { getVerifiedAssurance, requiresMfaChallenge, safeInternalPath } from "@/lib/auth/assurance";
import { logout } from "@/lib/auth/actions";
import { countRecoveryCodes } from "@/lib/auth/recovery-codes";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Autenticação em duas etapas — AgendFined",
  robots: { index: false, follow: false },
};

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeInternalPath(next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?${new URLSearchParams({ next: returnTo }).toString()}`);
  const { data: assurance, error: assuranceError } = await getVerifiedAssurance(supabase);
  if (assuranceError) throw assuranceError;

  // getUser() already returned the factors; listFactors() would ask Auth again (#214).
  const factorId =
    user.factors?.find((factor) => factor.factor_type === "totp" && factor.status === "verified")?.id ?? null;
  const verified = assurance.currentLevel === "aal2";
  // Only the confirmed session sees how many códigos de recuperação are left (#169).
  let recoveryCodesLeft: number | null | undefined;
  if (factorId && verified) {
    try {
      recoveryCodesLeft = await countRecoveryCodes(createAdminClient(), user.id);
    } catch {
      recoveryCodesLeft = null;
    }
  }
  // A confirmed session goes back to where it was headed, unless it has no
  // códigos de recuperação yet: confirming a new authenticator sets the aal2
  // cookie and re-renders this page, and the dono must stay to save the codes
  // that the panel generates next (#169).
  if (next && verified && recoveryCodesLeft !== 0) redirect(returnTo);

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 inline-flex">
        <BrandLogo />
      </Link>
      <div className="w-full">
        <MfaPanel
          factorId={factorId}
          verified={verified}
          recoveryCodesLeft={recoveryCodesLeft}
          returnTo={returnTo}
        />
      </div>
      {/* While the code is pending the painel sends the owner straight back
          here, so the way out is signing out instead of a link to it. */}
      {requiresMfaChallenge(assurance) ? (
        <form action={logout} className="mt-6">
          <button type="submit" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline">
            Sair da conta
          </button>
        </form>
      ) : (
        <Link href="/dashboard" className="mt-6 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline">
          ← Voltar ao painel
        </Link>
      )}
    </main>
  );
}
