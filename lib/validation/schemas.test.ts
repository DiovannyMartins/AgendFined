import { describe, expect, it } from "vitest";
import {
  availabilitySchema,
  bookingSchema,
  businessSchema,
  loginSchema,
  publicAvailabilitySchema,
  publicCodeSchema,
  serviceSchema,
  signupSchema,
  passwordSchema,
} from "@/lib/validation/schemas";

describe("businessSchema", () => {
  const valid = {
    name: "Barbearia Demo",
    slug: "barbearia-demo",
    phone: "+5511999999999",
    slotIntervalMinutes: 30,
    minNoticeMinutes: 120,
    bookingWindowDays: 60,
  };

  it("accepts a valid business", () => {
    expect(businessSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid slug (uppercase)", () => {
    expect(businessSchema.safeParse({ ...valid, slug: "Barbearia" }).success).toBe(false);
  });

  it("rejects a reserved pattern slug (double hyphen)", () => {
    expect(businessSchema.safeParse({ ...valid, slug: "a--b" }).success).toBe(false);
  });

  it("accepts a custom slot interval", () => {
    expect(businessSchema.safeParse({ ...valid, slotIntervalMinutes: 45 }).success).toBe(true);
  });

  it("rejects zero and intervals longer than one day", () => {
    expect(businessSchema.safeParse({ ...valid, slotIntervalMinutes: 0 }).success).toBe(false);
    expect(businessSchema.safeParse({ ...valid, slotIntervalMinutes: 1441 }).success).toBe(false);
  });
});

describe("serviceSchema", () => {
  const valid = { name: "Corte", durationMinutes: 30, priceCents: 4000 };

  it("accepts a valid service", () => {
    expect(serviceSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a free service (price 0)", () => {
    expect(serviceSchema.safeParse({ ...valid, priceCents: 0 }).success).toBe(true);
  });

  it("rejects negative price", () => {
    expect(serviceSchema.safeParse({ ...valid, priceCents: -1 }).success).toBe(false);
  });

  it("rejects a too-long duration", () => {
    expect(serviceSchema.safeParse({ ...valid, durationMinutes: 500 }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "12345678" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "12345678" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("requires a strong password", () => {
    expect(
      signupSchema.safeParse({ displayName: "João", email: "a@b.com", password: "short" }).success,
    ).toBe(false);
  });

  it("accepts valid signup", () => {
    expect(
      signupSchema.safeParse({ displayName: "João", email: "a@b.com", password: "uma senha longa e única 2026" }).success,
    ).toBe(true);
  });
});

describe("passwordSchema", () => {
  it("requires 15 characters with letters and digits", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("uma senha longa e única").success).toBe(false);
    expect(passwordSchema.safeParse("uma senha longa e única 2026").success).toBe(true);
  });
});

describe("bookingSchema", () => {
  const valid = {
    serviceId: "00000000-0000-0000-0000-000000000000",
    startAt: "2026-09-10T12:00:00.000Z",
    customerName: "Maria",
    customerPhone: "+5511988888888",
  };

  it("accepts a valid booking", () => {
    expect(bookingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-uuid service id", () => {
    expect(bookingSchema.safeParse({ ...valid, serviceId: "x" }).success).toBe(false);
  });

  it("rejects an invalid startAt datetime", () => {
    expect(bookingSchema.safeParse({ ...valid, startAt: "not-a-date" }).success).toBe(false);
  });

  it("accepts an empty optional email", () => {
    expect(bookingSchema.safeParse({ ...valid, customerEmail: "" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(bookingSchema.safeParse({ ...valid, customerEmail: "bad" }).success).toBe(false);
  });
});

describe("publicCodeSchema", () => {
  it("accepts a valid short public code", () => {
    expect(publicCodeSchema.safeParse("AB12CD34").success).toBe(true);
  });

  it("normalizes hyphens, whitespace and case", () => {
    const parsed = publicCodeSchema.safeParse("  ab12-cd34  ");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBe("AB12CD34");
  });

  it("rejects a string with invalid characters", () => {
    expect(publicCodeSchema.safeParse("AB12CD0O").success).toBe(false);
  });

  it("rejects a wrong-length code", () => {
    expect(publicCodeSchema.safeParse("AB12CD").success).toBe(false);
  });

  it("rejects a non-code string", () => {
    expect(publicCodeSchema.safeParse("not-a-code").success).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(publicCodeSchema.safeParse("").success).toBe(false);
  });
});

describe("publicAvailabilitySchema", () => {
  const valid = {
    businessId: "550e8400-e29b-41d4-a716-446655440000",
    serviceId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    date: "2026-09-23",
  };

  it("accepts a valid public availability request", () => {
    expect(publicAvailabilitySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects impossible calendar dates and invalid ids", () => {
    expect(publicAvailabilitySchema.safeParse({ ...valid, date: "2026-02-30" }).success).toBe(false);
    expect(publicAvailabilitySchema.safeParse({ ...valid, businessId: "not-an-id" }).success).toBe(false);
  });
});

describe("availabilitySchema (§8.5 faixas)", () => {
  const valid = { weekday: 1, startTime: "08:00", endTime: "18:00" };

  it("accepts a valid same-day faixa", () => {
    expect(availabilitySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a faixa whose end is before its start (midnight-crossing)", () => {
    expect(availabilitySchema.safeParse({ ...valid, startTime: "22:00", endTime: "02:00" }).success).toBe(false);
  });

  it("rejects a zero-length faixa", () => {
    expect(availabilitySchema.safeParse({ ...valid, startTime: "09:00", endTime: "09:00" }).success).toBe(false);
  });
});
