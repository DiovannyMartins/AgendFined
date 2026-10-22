import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

const { sendOwnerNewBookingEmail, sendOwnerCustomerCancelledEmail } = vi.hoisted(() => ({
  sendOwnerNewBookingEmail: vi.fn<(input: unknown) => Promise<SendResult>>(),
  sendOwnerCustomerCancelledEmail: vi.fn<(input: unknown) => Promise<SendResult>>(),
}));

vi.mock("@/lib/email/owner-booking-notification", () => ({
  sendOwnerNewBookingEmail,
  sendOwnerCustomerCancelledEmail,
}));

import { notifyOwner } from "@/lib/bookings/owner-notification";

const booking = {
  bookingId: "booking-1",
  ownerId: "owner-1",
  businessName: "Barbearia Demo",
  customerName: "Maria Souza",
  customerPhone: "11987654321",
  serviceName: "Corte",
  startAt: "2026-10-20T12:00:00Z",
  timezone: "America/Fortaleza",
  publicCode: "65925DBB",
};

function adminWithOwner(result: { data: unknown; error: unknown } | Error) {
  const getUserById = vi.fn(async (id: string) => {
    void id;
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { auth: { admin: { getUserById } } } as never, getUserById };
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.example");
  sendOwnerNewBookingEmail.mockReset().mockResolvedValue({ sent: true });
  sendOwnerCustomerCancelledEmail.mockReset().mockResolvedValue({ sent: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("notifyOwner", () => {
  it("e-mails a reserva nova to the e-mail of the account that owns the negócio", async () => {
    const { client, getUserById } = adminWithOwner({ data: { user: { email: "dono@example.com" } }, error: null });

    await notifyOwner(client, "new_booking", booking);

    expect(getUserById).toHaveBeenCalledWith("owner-1");
    expect(sendOwnerNewBookingEmail).toHaveBeenCalledWith({
      ownerEmail: "dono@example.com",
      businessName: "Barbearia Demo",
      customerName: "Maria Souza",
      customerPhone: "11987654321",
      serviceName: "Corte",
      startAt: "2026-10-20T12:00:00Z",
      timezone: "America/Fortaleza",
      publicCode: "65925DBB",
      agendaUrl: "https://agenda.example/dashboard/agenda",
    });
    expect(sendOwnerCustomerCancelledEmail).not.toHaveBeenCalled();
  });

  it("e-mails a cancellation by the cliente with the cancellation wording", async () => {
    const { client } = adminWithOwner({ data: { user: { email: "dono@example.com" } }, error: null });

    await notifyOwner(client, "customer_cancelled", booking);

    expect(sendOwnerCustomerCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: "dono@example.com", publicCode: "65925DBB" }),
    );
    expect(sendOwnerNewBookingEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["the account has no e-mail", { data: { user: { email: null } }, error: null }, "owner_email_not_found"],
    ["the account cannot be read", { data: { user: null }, error: { message: "boom" } }, "owner_email_not_found"],
    ["the lookup throws", new Error("network"), "unexpected_error"],
  ])("only logs when %s", async (_case, result, reason) => {
    const { client } = adminWithOwner(result);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyOwner(client, "new_booking", booking)).resolves.toBeUndefined();

    expect(sendOwnerNewBookingEmail).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("owner_notification_email_failed", {
      bookingId: "booking-1",
      event: "new_booking",
      reason,
    });
  });

  it("only logs when the provider fails, without the dono's e-mail", async () => {
    const { client } = adminWithOwner({ data: { user: { email: "dono@example.com" } }, error: null });
    sendOwnerCustomerCancelledEmail.mockResolvedValue({ sent: false, reason: "provider_error" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyOwner(client, "customer_cancelled", booking)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith("owner_notification_email_failed", {
      bookingId: "booking-1",
      event: "customer_cancelled",
      reason: "provider_error",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("dono@example.com");
  });
});
