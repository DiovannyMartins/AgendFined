import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };
type RpcResult = { data: unknown; error: { message: string } | null };

const { state, sendBookingConfirmationEmail, sendWaitlistSlotFreedEmail } = vi.hoisted(() => ({
  state: {
    rpcResults: {} as Record<string, RpcResult>,
    serviceName: "Corte" as string | null,
  },
  sendBookingConfirmationEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
  sendWaitlistSlotFreedEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/bookings/classification", () => ({ classifyOperationalError: vi.fn(async () => null) }));
vi.mock("@/lib/email/booking-confirmation", () => ({ sendBookingConfirmationEmail }));
vi.mock("@/lib/email/waitlist-slot-freed", () => ({ sendWaitlistSlotFreedEmail }));
vi.mock("@/lib/business/queries", () => ({
  getCurrentBusiness: async () => ({
    id: "business-1",
    name: "Barbearia Demo",
    slug: "barbearia-demo",
    phone: "11987654321",
    timezone: "America/Sao_Paulo",
    plan: "pro",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => state.rpcResults[name] ?? { data: null, error: { message: "unexpected rpc" } },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: state.serviceName ? { name: state.serviceName } : null,
          error: null,
        }),
      };
      return query;
    },
  }),
}));

import { convertWaitlistEntry, notifyWaitlistEntry } from "./actions";

const START_AT = "2026-10-27T16:00:00.000Z";

function entryForm() {
  const formData = new FormData();
  formData.set("id", "entry-1");
  return formData;
}

function entry(customerEmail: string | null) {
  return {
    id: "entry-1",
    business_id: "business-1",
    service_id: "service-1",
    start_at: START_AT,
    customer_name: "Bruna",
    customer_phone: "11912345678",
    customer_email: customerEmail,
    status: "notified",
    created_at: "2026-10-20T12:00:00.000Z",
  };
}

function convertedBooking(customerEmail: string | null) {
  return {
    id: "booking-1",
    business_id: "business-1",
    public_code: "58FTBJNV",
    start_at: START_AT,
    customer_name_snapshot: "Bruna",
    customer_email_snapshot: customerEmail,
    service_name_snapshot: "Corte",
    status: "confirmed",
  };
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.example");
  state.rpcResults = {};
  state.serviceName = "Corte";
  sendBookingConfirmationEmail.mockClear().mockResolvedValue({ sent: true });
  sendWaitlistSlotFreedEmail.mockClear().mockResolvedValue({ sent: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notifyWaitlistEntry", () => {
  it("e-mails the cliente that the horário is free, with a link to reserve", async () => {
    state.rpcResults.notify_waitlist_entry = { data: entry("bruna@example.com"), error: null };

    const result = await notifyWaitlistEntry({ ok: true }, entryForm());

    expect(result).toEqual({ ok: true, message: "Aviso enviado por e-mail para bruna@example.com." });
    expect(sendWaitlistSlotFreedEmail).toHaveBeenCalledWith({
      customerName: "Bruna",
      customerEmail: "bruna@example.com",
      businessName: "Barbearia Demo",
      businessPhone: "11987654321",
      serviceName: "Corte",
      startAt: START_AT,
      timezone: "America/Sao_Paulo",
      bookingUrl: "https://agenda.example/barbearia-demo",
    });
  });

  it("tells the dono to warn the cliente by phone when there is no e-mail", async () => {
    state.rpcResults.notify_waitlist_entry = { data: entry(null), error: null };

    const result = await notifyWaitlistEntry({ ok: true }, entryForm());

    expect(sendWaitlistSlotFreedEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      message: "Sem e-mail cadastrado. Avise o cliente pelo telefone ou WhatsApp.",
    });
  });

  it("tells the dono to warn the cliente by phone when the e-mail fails", async () => {
    state.rpcResults.notify_waitlist_entry = { data: entry("bruna@example.com"), error: null };
    sendWaitlistSlotFreedEmail.mockResolvedValue({ sent: false, reason: "provider_error" });

    const result = await notifyWaitlistEntry({ ok: true }, entryForm());

    expect(result).toEqual({
      ok: true,
      message: "Não foi possível enviar o e-mail. Avise o cliente pelo telefone ou WhatsApp.",
    });
  });

  it("sends nothing when the entrada cannot be notified", async () => {
    state.rpcResults.notify_waitlist_entry = { data: null, error: { message: "WAITLIST_ALREADY_CONVERTED" } };

    const result = await notifyWaitlistEntry({ ok: true }, entryForm());

    expect(result).toEqual({ ok: false, message: "Essa entrada não pode ser notificada." });
    expect(sendWaitlistSlotFreedEmail).not.toHaveBeenCalled();
  });
});

describe("convertWaitlistEntry", () => {
  it("sends the cliente the same confirmação as a public reserva, with the private link", async () => {
    state.rpcResults.convert_waitlist_entry = { data: convertedBooking("bruna@example.com"), error: null };

    const result = await convertWaitlistEntry({ ok: true }, entryForm());

    expect(result).toMatchObject({
      ok: true,
      publicCode: "58FTBJNV",
      message: "Confirmação enviada por e-mail para bruna@example.com.",
    });
    expect(result.cancellationUrl).toMatch(/^\/barbearia-demo\/confirmacao\?code=58FTBJNV#cancel=.+/);
    expect(sendBookingConfirmationEmail).toHaveBeenCalledWith({
      customerName: "Bruna",
      customerEmail: "bruna@example.com",
      businessName: "Barbearia Demo",
      serviceName: "Corte",
      startAt: START_AT,
      timezone: "America/Sao_Paulo",
      publicCode: "58FTBJNV",
      businessPhone: "11987654321",
      confirmationUrl: `https://agenda.example${result.cancellationUrl}`,
    });
  });

  it("asks the dono to send the private link when there is no e-mail", async () => {
    state.rpcResults.convert_waitlist_entry = { data: convertedBooking(null), error: null };

    const result = await convertWaitlistEntry({ ok: true }, entryForm());

    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      publicCode: "58FTBJNV",
      message: "Sem e-mail cadastrado. Envie ao cliente o link da confirmação privada.",
    });
  });

  it("asks the dono to send the private link when the e-mail fails", async () => {
    state.rpcResults.convert_waitlist_entry = { data: convertedBooking("bruna@example.com"), error: null };
    sendBookingConfirmationEmail.mockResolvedValue({ sent: false, reason: "not_configured" });

    const result = await convertWaitlistEntry({ ok: true }, entryForm());

    expect(result).toMatchObject({
      ok: true,
      publicCode: "58FTBJNV",
      message: "Não foi possível enviar o e-mail. Envie ao cliente o link da confirmação privada.",
    });
  });

  it("sends nothing while the horário is still taken", async () => {
    state.rpcResults.convert_waitlist_entry = { data: null, error: { message: "bookings_no_overlap" } };

    const result = await convertWaitlistEntry({ ok: true }, entryForm());

    expect(result).toEqual({
      ok: false,
      message: "Esse horário ainda está ocupado. Converta quando ele for liberado.",
    });
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled();
  });
});
