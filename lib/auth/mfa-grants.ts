import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// GHSA-vjcg: o limite de tentativas do TOTP fica no app, e o Supabase Auth
// também aceita o código chamado direto. O banco só reconhece o segundo fator
// confirmado num desafio que o app registrou antes de verificar, e só deixa
// apagar um fator verificado com o registro do app
// (migration 20261031060000_mfa_verified_by_app).

type AdminClient = ReturnType<typeof createAdminClient>;

// false quando houve verificação direta no Auth nos últimos 15 minutos: o
// código acertado fora do app não pode ser reaproveitado aqui. Lança se o
// banco falhar, para a Server Action falhar fechada.
export async function grantMfaChallenge(
  admin: AdminClient,
  userId: string,
  sessionId: string,
  challengeId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("grant_mfa_challenge", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data === true;
}

export async function grantMfaFactorRemoval(admin: AdminClient, userId: string, factorId: string): Promise<boolean> {
  const { error } = await admin.rpc("grant_mfa_factor_removal", { p_user_id: userId, p_factor_id: factorId });
  return !error;
}
