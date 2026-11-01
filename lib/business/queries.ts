import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

// Cached per request (#214): the painel layout and its page both read the
// negócio, and it must cost one `businesses` select. `has_access` is
// `business_has_access()` (ADR 0013), computed in the database from now();
// a failed lookup is "no access" (fail-closed).
export const getCurrentBusiness = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) return null;

  const { data: hasAccess, error } = await supabase.rpc("business_has_access", { p_business_id: business.id });
  return { ...business, has_access: !error && hasAccess === true };
});

export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});
