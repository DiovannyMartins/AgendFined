import { describe, expect, it } from "vitest";
import { consultBooking } from "@/lib/booking/actions";

describe("consultBooking", () => {
  it("reports malformed codes before requiring anti-bot verification", async () => {
    const formData = new FormData();
    formData.set("code", "not-a-code");

    const result = await consultBooking({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      code: "INVALID_CODE",
      message: "Informe um código de reserva válido.",
    });
  });
});
