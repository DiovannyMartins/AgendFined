import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaPanel } from "./mfa-panel";
import { safeInternalPath } from "@/lib/auth/assurance";

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
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (next && assurance.currentLevel === "aal2") redirect(returnTo);

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 inline-flex">
        <BrandLogo />
      </Link>
      <div className="w-full">
        <MfaPanel
          factorId={data.totp.find((factor) => factor.status === "verified")?.id ?? null}
          verified={assurance.currentLevel === "aal2"}
          returnTo={returnTo}
        />
      </div>
    </main>
  );
}
