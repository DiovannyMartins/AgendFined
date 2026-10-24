import "server-only";
import { createHash, randomInt } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

// Códigos de recuperação do MFA (#169, ADR 0009). Supabase Auth não tem
// códigos nativos: o app gera dez códigos de uso único quando o dono ativa o
// autenticador e guarda só o digest de cada um, como o token de cancelamento
// (ADR 0005). Usar um código desativa o autenticador e obriga a ativar de novo.
//
// Cada código tem 10 símbolos Crockford base32 (50 bits), mostrados como
// XXXXX-XXXXX. A entrada é lida como o código público da reserva (ADR 0004):
// sem hífen, sem espaços, em qualquer caixa e com O/I/L como 0/1.

export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const NORMALIZED_REGEX = /^[0-9A-HJKMNP-TV-Z]{10}$/;

type AdminClient = ReturnType<typeof createAdminClient>;

export function normalizeRecoveryCode(input: string): string | null {
  const normalized = input
    .replace(/[-\s]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return NORMALIZED_REGEX.test(normalized) ? normalized : null;
}

// O usuário entra no digest para que o mesmo código em duas contas não tenha
// o mesmo hash.
export function hashRecoveryCode(userId: string, normalizedCode: string): string {
  return createHash("sha256").update(`${userId}:${normalizedCode}`, "utf8").digest("hex");
}

export function generateRecoveryCodes(userId: string): { codes: string[]; hashes: string[] } {
  const normalized = new Set<string>();
  while (normalized.size < RECOVERY_CODE_COUNT) {
    normalized.add(Array.from({ length: RECOVERY_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""));
  }
  const values = Array.from(normalized);
  return {
    codes: values.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`),
    hashes: values.map((code) => hashRecoveryCode(userId, code)),
  };
}

// Troca todos os códigos do usuário pelos novos; os anteriores deixam de valer.
export async function replaceRecoveryCodes(admin: AdminClient, userId: string, hashes: string[]): Promise<boolean> {
  const { error } = await admin.rpc("replace_mfa_recovery_codes", { p_user_id: userId, p_code_hashes: hashes });
  return !error;
}

// Apaga o código se ele existir; true quando havia um código a usar.
export async function consumeRecoveryCode(admin: AdminClient, userId: string, normalizedCode: string): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_mfa_recovery_code", {
    p_user_id: userId,
    p_code_hash: hashRecoveryCode(userId, normalizedCode),
  });
  if (error) throw error;
  return data === true;
}

export async function clearRecoveryCodes(admin: AdminClient, userId: string): Promise<boolean> {
  const { error } = await admin.rpc("clear_mfa_recovery_codes", { p_user_id: userId });
  return !error;
}

export async function countRecoveryCodes(admin: AdminClient, userId: string): Promise<number | null> {
  const { data, error } = await admin.rpc("count_mfa_recovery_codes", { p_user_id: userId });
  return error ? null : data;
}
