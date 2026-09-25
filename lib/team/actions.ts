"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { auditSecurityEvent } from "@/lib/security/audit";

type Result = { ok: true } | { ok: false; message: string };
const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "user"]),
});

export async function setMemberRole(userId: string, role: string): Promise<Result> {
  const parsed = memberSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, message: "Informe um ID de usuário e um papel válidos." };
  const business = await getCurrentBusiness("admin");
  if (!business) return { ok: false, message: "Acesso restrito a administradores." };
  if (parsed.data.userId === business.owner_id) {
    return { ok: false, message: "O dono do negócio já é administrador." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("business_memberships").upsert({
    business_id: business.id,
    user_id: parsed.data.userId,
    role: parsed.data.role,
  }, { onConflict: "business_id,user_id" });
  if (error) return { ok: false, message: "Não foi possível adicionar o membro. Confirme que a conta já existe." };
  const { data: { user } } = await supabase.auth.getUser();
  auditSecurityEvent("team.member_role_set", user?.id, {
    businessId: business.id,
    targetUserId: parsed.data.userId,
    role: parsed.data.role,
  });
  revalidatePath("/dashboard/configuracoes");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<Result> {
  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return { ok: false, message: "ID de usuário inválido." };
  const business = await getCurrentBusiness("admin");
  if (!business) return { ok: false, message: "Acesso restrito a administradores." };
  const supabase = await createClient();
  const { error } = await supabase.from("business_memberships")
    .delete().eq("business_id", business.id).eq("user_id", parsed.data);
  if (error) return { ok: false, message: "Não foi possível remover o membro." };
  const { data: { user } } = await supabase.auth.getUser();
  auditSecurityEvent("team.member_removed", user?.id, {
    businessId: business.id,
    targetUserId: parsed.data,
  });
  revalidatePath("/dashboard/configuracoes");
  return { ok: true };
}
