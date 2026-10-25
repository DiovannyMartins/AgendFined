import { z } from "zod";
import { isValidPublicCode, normalizePublicCode } from "@/lib/bookings/public-code";
import { isValidTimeZone } from "@/lib/app-timezone";
import { MAX_PRICE_CENTS, MAX_PRICE_MESSAGE, PRICE_INPUT_PATTERN, parsePriceToCents } from "@/lib/format/currency";
import { RESERVED_SLUG_MESSAGE, isReservedSlug } from "@/lib/business/reserved-slugs";

export const loginSchema = z.object({
  email: z.string().trim().max(254).email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha.").max(128, "Senha inválida."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z.string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(128, "Senha muito longa.")
  .regex(/[a-z]/, "Inclua pelo menos uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua pelo menos uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua pelo menos um número.")
  .regex(/[^A-Za-z0-9\s]/, "Inclua pelo menos um símbolo.");

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, "Informe seu nome.").max(100, "Nome muito longo."),
  email: z.string().trim().max(254).email("Informe um e-mail válido."),
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const emailSchema = z.string().trim().max(254).email("Informe um e-mail válido.");

// Dashboard schemas: their messages are shown verbatim in the forms, so every
// rule carries a pt-BR message and none falls back to Zod's English default.

// An integer within [min, max]; one message covers a blank/NaN input, a
// fraction and both bounds, since the fix is the same for all of them.
const wholeNumber = (min: number, max: number, message: string) =>
  z.number({ error: message }).int(message).min(min, message).max(max, message);

const descriptionField = z
  .string()
  .trim()
  .max(500, "A descrição não pode passar de 500 caracteres.")
  // nullish: accepts "", null (empty in the form maps to null server-side) and
  // undefined, so the optional description can genuinely be left blank.
  .nullish();

// Phone of a negócio or of a cliente (reserva, lista de espera): a Brazilian
// number (fixo or celular, with or without +55), stored as national digits
// (DDD + número) so the agenda and the waitlist dedup see a single canonical
// form and every screen formats it the same way (lib/format/phone.ts).
const INVALID_BRAZILIAN_PHONE = "Informe um telefone brasileiro válido, como (11) 98888-7777.";

export const brazilianPhoneSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe seu telefone.", abort: true })
  .max(30, { error: "O telefone não pode passar de 30 caracteres.", abort: true })
  .regex(/^\+?[\d\s().-]+$/, { error: "Informe um telefone válido com DDD, como (11) 98888-7777.", abort: true })
  .transform((value, ctx) => {
    const digits = value.replace(/\D/g, "");
    if (value.startsWith("+") && !digits.startsWith("55")) {
      ctx.issues.push({ code: "custom", input: value, message: INVALID_BRAZILIAN_PHONE });
      return z.NEVER;
    }
    // 12-13 digits can only be 55 + DDD + número; 11 digits starting with 55
    // is a celular from DDD 55, so the country code is stripped by length.
    const national = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
    if (national.length < 10 || national.length > 11) {
      ctx.issues.push({ code: "custom", input: value, message: "Informe um telefone com DDD." });
      return z.NEVER;
    }
    // DDDs never contain a zero; celulares have 9 digits starting with 9 and
    // fixos have 8 digits starting with 2-5.
    if (!/^[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(national)) {
      ctx.issues.push({ code: "custom", input: value, message: INVALID_BRAZILIAN_PHONE });
      return z.NEVER;
    }
    return national;
  });

export const customerPhoneSchema = brazilianPhoneSchema;

const businessFields = {
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(100, "O nome não pode passar de 100 caracteres."),
  slug: z
    .string()
    .trim()
    .min(3, "O slug deve ter pelo menos 3 caracteres.")
    .max(50, "O slug não pode passar de 50 caracteres.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido: apenas letras minúsculas, números e hífen."),
  phone: brazilianPhoneSchema,
  minNoticeMinutes: wholeNumber(0, 10080, "Informe uma antecedência entre 0 e 10080 minutos."),
  bookingWindowDays: wholeNumber(1, 365, "Informe uma janela entre 1 e 365 dias."),
  description: descriptionField,
};

// Intervals between horários on the public page (#191): a free number let a
// negócio offer 08:00, 08:01, 08:02… or odd starts such as 08:07.
export const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

const SLOT_INTERVAL_MESSAGE = "Escolha um dos intervalos da lista.";

export function isSlotIntervalOption(minutes: number): boolean {
  return (SLOT_INTERVAL_OPTIONS as readonly number[]).includes(minutes);
}

// A negócio saved with another interval before the list keeps it while it
// saves the other fields (`currentSlotInterval`), but cannot move to another
// value outside the list.
export function businessSchemaFor(currentSlotInterval?: number | null) {
  return z.object({
    ...businessFields,
    slotIntervalMinutes: z
      .number({ error: SLOT_INTERVAL_MESSAGE })
      .refine((minutes) => isSlotIntervalOption(minutes) || minutes === currentSlotInterval, SLOT_INTERVAL_MESSAGE),
    timezone: z
      .string()
      .trim()
      .min(1, "Escolha um fuso horário.")
      .refine(isValidTimeZone, "Informe um fuso horário IANA válido."),
  });
}

export const businessSchema = businessSchemaFor();
export type BusinessInput = z.infer<typeof businessSchema>;

// Client-side form schema for the business setup form (React Hook Form).
// Mirrors businessSchema but with string-typed fields to match native inputs.
export const businessFormSchema = z.object({
  ...businessFields,
  // Same rule createBusiness and updateBusiness enforce server-side, shown inline before submit.
  slug: businessFields.slug.refine((slug) => !isReservedSlug(slug), RESERVED_SLUG_MESSAGE),
  // The select offers only the list (plus the negócio's current interval, which
  // the client cannot tell apart), so the server checks the value.
  slotIntervalMinutes: z.string().regex(/^\d+$/, SLOT_INTERVAL_MESSAGE),
  timezone: z.string().trim().min(1, "Escolha um fuso horário."),
});
export type BusinessFormValues = z.infer<typeof businessFormSchema>;

const serviceFields = {
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(80, "O nome não pode passar de 80 caracteres."),
  description: descriptionField,
  durationMinutes: wholeNumber(5, 480, "Informe uma duração entre 5 e 480 minutos."),
};

export const serviceSchema = z.object({
  ...serviceFields,
  priceCents: z
    .number({ error: "Informe um preço válido." })
    .int("Informe um preço válido.")
    .min(0, "Informe um preço válido.")
    .max(MAX_PRICE_CENTS, MAX_PRICE_MESSAGE),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

// Client-side form schema for services (React Hook Form). The price is entered
// in reais ("49,90", "49.90" or "1.234,56", see PRICE_INPUT_PATTERN) and converted to
// centavos by parsePriceToCents in the server action.
export const serviceFormSchema = z.object({
  ...serviceFields,
  price: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, "Informe um preço válido, como 49,90.")
    .refine((value) => (parsePriceToCents(value) ?? 0) <= MAX_PRICE_CENTS, MAX_PRICE_MESSAGE),
});
export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export const availabilitySchema = z
  .object({
    weekday: wholeNumber(1, 7, "Escolha um dia da semana válido."),
    startTime: z.string().regex(TIME_PATTERN, "Informe um horário de início válido."),
    endTime: z.string().regex(TIME_PATTERN, "Informe um horário de fim válido."),
  })
  .superRefine((val, ctx) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    // §8.5/§9.3: a faixa must end after it starts, which also rules out
    // crossing midnight (22:00 → 02:00 ends "before" it starts).
    if (toMin(val.startTime) >= toMin(val.endTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "O fim deve ser depois do início.",
      });
    }
  });
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

// Bloqueios come from <input type="datetime-local">: wall-clock time without an
// offset, interpreted in the business timezone by the action (never by the DB).
const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Informe data e hora válidas.")
  .refine((value) => {
    const [y, m, d, hh, mm] = value.split(/[-T:]/).map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d, hh, mm));
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
      && probe.getUTCHours() === hh && probe.getUTCMinutes() === mm;
  }, "Informe data e hora válidas.");

export const blockSchema = z.object({
  startAt: localDateTimeSchema,
  endAt: localDateTimeSchema,
  reason: z.string().trim().max(120, "O motivo não pode passar de 120 caracteres.").nullish(),
});
export type BlockInput = z.infer<typeof blockSchema>;

export const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customerName: z
    .string()
    .trim()
    .min(2, "Informe seu nome completo.")
    .max(100, "O nome não pode passar de 100 caracteres."),
  customerPhone: customerPhoneSchema,
  // Lowercased before it reaches customers.email and the snapshots (#198): the
  // same address typed with another caixa must not look like another cliente.
  customerEmail: z.string().trim().toLowerCase().email("Informe um e-mail válido.").optional().or(z.literal("")),
  customerNote: z.string().trim().max(500, "A observação não pode passar de 500 caracteres.").optional(),
});
export type BookingInput = z.infer<typeof bookingSchema>;

// The e-mail is optional on the public page too (#195, ADR 0011): many clientes
// of a barbearia or salão have none at hand and gave up on the form. Without
// it, the confirmation page is where the cliente keeps the private link.
// Blank (or only spaces) means "no e-mail", so the check runs after the trim.
export const publicBookingSchema = bookingSchema.extend({
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, "O e-mail não pode passar de 200 caracteres.")
    .refine((value) => value === "" || z.string().email().safeParse(value).success, "Informe um e-mail válido.")
    .optional(),
});
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

// A real calendar date "YYYY-MM-DD" (2026-02-30 is rejected).
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }, "Data inválida.");

export const publicAvailabilitySchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: calendarDateSchema,
});

// The business-local date + start time the public page sends. Checked before
// it is converted to a UTC instant, which would throw on a malformed value.
export const publicSlotSchema = z.object({
  date: calendarDateSchema,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
});

// Reserva criada pelo dono no painel (#193). O e-mail é opcional: o cliente que
// marca por WhatsApp, telefone ou no balcão nem sempre informa um. As mensagens
// falam do cliente, porque quem preenche é o dono.
export const ownerBookingSchema = z.object({
  serviceId: z.string().uuid({ error: "Escolha um serviço." }),
  date: z.string().min(1, { error: "Escolha a data.", abort: true }).pipe(calendarDateSchema),
  startTime: z
    .string()
    .min(1, { error: "Escolha o horário.", abort: true })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
  customerName: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente.")
    .max(100, "O nome não pode passar de 100 caracteres."),
  customerPhone: z
    .string()
    .trim()
    .min(1, { error: "Informe o telefone do cliente.", abort: true })
    .pipe(brazilianPhoneSchema),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, "O e-mail não pode passar de 200 caracteres.")
    .email("Informe um e-mail válido.")
    .optional()
    .or(z.literal("")),
  customerNote: z.string().trim().max(500, "A observação não pode passar de 500 caracteres.").optional(),
});
export type OwnerBookingInput = z.infer<typeof ownerBookingSchema>;

// Remarcação pelo dono (#194): a mesma reserva vai para outra data e horário.
export const ownerRescheduleSchema = ownerBookingSchema.pick({ date: true, startTime: true }).extend({
  bookingId: z.string().uuid({ error: "Reserva inválida." }),
});

export const bookingStatusSchema = z.enum(["confirmed", "completed", "cancelled", "no_show"]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

// Waitlist entry (INC-3). A customer who found a preferred slot occupied leaves
// contact details + the desired slot (service/start) so they can be offered a
// re-opening. `start_at` is a UTC instant (ADR 0003), re-validated by the
// server action that converts the business-local date+time selection.
// The customer fields share the reserva rules (and their pt-BR messages), so a
// phone is normalized, and therefore deduplicated, the same way in both places.
export const waitlistSchema = bookingSchema.pick({
  serviceId: true,
  startAt: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
});
export type WaitlistInput = z.infer<typeof waitlistSchema>;

// Public reservation code. An 8-char Crockford base32 code (XXXX-XXXX on screen),
// normalized (hyphens/spaces stripped, uppercased, O→0 and I/L→1) before
// validation. It is used only on the public confirmation screen and must never
// authorize access to customer data.
export const publicCodeSchema = z
  .string()
  .trim()
  .transform((s) => normalizePublicCode(s))
  .refine(isValidPublicCode, "Informe um código de reserva válido.");
export type PublicCodeInput = z.infer<typeof publicCodeSchema>;

// The customer-provided part of a public reservation, validated on its own so
// the booking page can show each error next to its field.
export const customerDetailsSchema = publicBookingSchema.pick({
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  customerNote: true,
});
