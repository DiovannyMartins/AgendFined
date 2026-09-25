import { createClient } from "@/lib/supabase/server";

export type BusinessRole = "admin" | "editor" | "user";
const roleRank: Record<BusinessRole, number> = { user: 0, editor: 1, admin: 2 };

export async function getCurrentBusiness(requiredRole: BusinessRole = "user") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: owned } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned) return owned;

  const { data: membership } = await supabase
    .from("business_memberships")
    .select("business_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || roleRank[membership.role] < roleRank[requiredRole]) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", membership.business_id)
    .maybeSingle();
  return business;
}

export async function getCurrentBusinessRole(): Promise<BusinessRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: owned } = await supabase.from("businesses").select("id").eq("owner_id", user.id).maybeSingle();
  if (owned) return "admin";
  const { data: membership } = await supabase.from("business_memberships").select("role").eq("user_id", user.id).maybeSingle();
  return membership?.role ?? null;
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
}
