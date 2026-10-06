import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { DashboardNav } from "./nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="flex w-full flex-col lg:flex-row">
        <DashboardNav slug={business?.slug ?? null} />
        <main id="main-content" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
