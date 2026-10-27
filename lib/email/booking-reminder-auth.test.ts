import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "../../supabase/functions/booking-reminders/auth";

describe("isAuthorizedCronRequest", () => {
  it("accepts only the exact bearer", async () => {
    expect(await isAuthorizedCronRequest("Bearer s3cret", "s3cret")).toBe(true);
    expect(await isAuthorizedCronRequest("Bearer s3creT", "s3cret")).toBe(false);
    expect(await isAuthorizedCronRequest("Bearer s3cret ", "s3cret")).toBe(false);
    expect(await isAuthorizedCronRequest("s3cret", "s3cret")).toBe(false);
    expect(await isAuthorizedCronRequest(null, "s3cret")).toBe(false);
  });

  it("fails closed without a configured secret", async () => {
    expect(await isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(await isAuthorizedCronRequest(null, "")).toBe(false);
  });
});
