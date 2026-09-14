import { z } from "zod";
import { isValidPublicCode, normalizePublicCode } from "@/lib/bookings/public-code";

export const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const businessSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido: apenas letras minúsculas, números e hífen."),
  phone: z.string().trim().min(8).max(20),
  slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)], { error: "Intervalo deve ser 15, 30 ou 60." }),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingWindowDays: z.number().int().min(1).max(180),
  // nullish: accepts "", null (empty in the form maps to null server-side) and
  // undefined, so the optional description can genuinely be left blank.
  description: z.string().trim().max(500).nullish(),
});
export type BusinessInput = z.infer<typeof businessSchema>;

// Client-side form schema for the business setup form (React Hook Form).
// Mirrors businessSchema but with string-typed fields to match native inputs.
export const businessFormSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido: apenas letras minúsculas, números e hífen."),
  phone: z.string().trim().min(8).max(20),
  slotIntervalMinutes: z.string().regex(/^(15|30|60)$/, "Intervalo deve ser 15, 30 ou 60."),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingWindowDays: z.number().int().min(1).max(180),
  description: z.string().trim().max(500).nullish(),
});
export type BusinessFormValues = z.infer<typeof businessFormSchema>;

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

// Client-side form schema for services (React Hook Form). priceCents is entered
// in reais (e.g. "49.90") and converted to cents in the server action.
export const serviceFormSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  durationMinutes: z.number().int().min(5).max(480),
  price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Informe um preço válido."),
});
export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const availabilitySchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .superRefine((val, ctx) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    // §8.5/§9.3: a faixa must end after it starts and must not cross midnight.
    if (toMin(val.startTime) >= toMin(val.endTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "O fim deve ser depois do início e a faixa não pode atravessar a meia-noite.",
      });
    }
  });
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const blockSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().trim().max(120).nullish(),
});
export type BlockInput = z.infer<typeof blockSchema>;

export const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(8).max(20),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerNote: z.string().trim().max(500).optional(),
});
export type BookingInput = z.infer<typeof bookingSchema>;

export const bookingStatusSchema = z.enum(["confirmed", "completed", "cancelled", "no_show"]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

// Waitlist entry (INC-3). A customer who found a preferred slot occupied leaves
// contact details + the desired slot (service/start) so they can be offered a
// re-opening. `start_at` is a UTC instant (ADR 0003), re-validated by the
// server action that converts the business-local date+time selection.
export const waitlistSchema = z.object({
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(8).max(20),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
});
export type WaitlistInput = z.infer<typeof waitlistSchema>;

// Public reservation code. An 8-char Crockford base32 code (XXXX-XXXX on screen),
// normalized (hyphens/spaces stripped, uppercased) before validation. It is used
// only on the public confirmation screen and must never authorize access to
// customer data.
export const publicCodeSchema = z
  .string()
  .trim()
  .transform((s) => normalizePublicCode(s))
  .refine(isValidPublicCode, "Informe um código de reserva válido.");
export type PublicCodeInput = z.infer<typeof publicCodeSchema>;
