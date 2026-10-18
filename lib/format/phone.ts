import { brazilianPhoneSchema } from "@/lib/validation/schemas";

// Shared phone rendering. Phones are stored as national digits (DDD + número,
// see brazilianPhoneSchema), so screens show "(11) 98888-7777" instead of the
// raw "11988887777". Older rows in another shape (e.g. "+5511999999999") are
// read through the same rule; anything it rejects is shown as stored.
export function formatPhoneBR(phone: string): string {
  const parsed = brazilianPhoneSchema.safeParse(phone);
  if (!parsed.success) return phone.trim();
  const national = parsed.data;
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  const split = number.length - 4;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}

// Whether a search typed as a phone ("(11) 98765", "98765-43") points at this
// phone. Only the digits are compared, so the formatted text on screen finds
// the stored digits.
export function matchesPhone(phone: string, query: string): boolean {
  const q = query.trim();
  if (!/^[\d\s().+-]+$/.test(q)) return false;
  const digits = q.replace(/\D/g, "");
  return digits.length > 0 && phone.replace(/\D/g, "").includes(digits);
}
