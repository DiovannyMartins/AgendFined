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

// Links to reach the negócio from the confirmation, the consulta and the
// e-mails (#149): `tel:` for any valid phone, WhatsApp only for a celular
// (9 digits after the DDD). null when the stored phone is not a valid one.
export function phoneTelHref(phone: string): string | null {
  const parsed = brazilianPhoneSchema.safeParse(phone);
  return parsed.success ? `tel:+55${parsed.data}` : null;
}

export function whatsappHref(phone: string): string | null {
  const parsed = brazilianPhoneSchema.safeParse(phone);
  if (!parsed.success || parsed.data.length !== 11) return null;
  return `https://wa.me/55${parsed.data}`;
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
