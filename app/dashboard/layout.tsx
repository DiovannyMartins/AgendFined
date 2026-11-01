import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DashboardNav } from "./nav";
import { GraceBanner } from "./grace-banner";
import { AccessBanner } from "./access-banner";
import { REQUEST_PATH_HEADER, getVerifiedAssurance, mfaChallengePath, requiresMfaChallenge } from "@/lib/auth/assurance";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: assurance, error: assuranceError } = await getVerifiedAssurance(supabase);
  if (assuranceError || requiresMfaChallenge(assurance)) {
    // Back to the page that was asked for, not just the painel (#149);
    // mfaChallengePath only accepts internal paths.
    redirect(mfaChallengePath((await headers()).get(REQUEST_PATH_HEADER) ?? "/dashboard"));
  }

  const business = await getCurrentBusiness();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="flex w-full flex-col lg:flex-row">
        <DashboardNav slug={business?.slug ?? null} />
        <main id="main-content" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">
            {business && (
              <>
                <AccessBanner
                  business={{
                    id: business.id,
                    plan: business.plan,
                    currentSubscriptionId: business.current_subscription_id,
                    hasAccess: business.has_access,
                    trialEndsAt: business.trial_ends_at,
                  }}
                />
                <GraceBanner
                  business={{
                    id: business.id,
                    plan: business.plan,
                    timezone: business.timezone,
                    currentSubscriptionId: business.current_subscription_id,
                  }}
                />
              </>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
