import { describe, expect, it } from "vitest";
import { resolveSignedWebhookDataId } from "./webhook-envelope";

describe("Mercado Pago webhook envelope", () => {
  it("uses the signed query ID when the body agrees", () => {
    expect(resolveSignedWebhookDataId("preapproval-123", "preapproval-123")).toBe("preapproval-123");
  });

  it("rejects a missing signed query ID", () => {
    expect(resolveSignedWebhookDataId(null, "preapproval-123")).toBeNull();
  });

  it("rejects a body ID that differs from the signed query ID", () => {
    expect(resolveSignedWebhookDataId("signed-id", "different-id")).toBeNull();
  });
});
