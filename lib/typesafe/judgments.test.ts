import { describe, expect, it } from "vitest";
import {
  classifyCancellationReason,
  classifyCustomerNote,
  classifyOperationalError,
  classifyReportInsight,
  matchCustomersToQuery,
  scoreWaitlistPriority,
  selectServiceFromDescription,
} from "@/lib/typesafe/judgments";

describe("TypeSafe judgments", () => {
  it("keeps cancellation classification optional when no API key is configured", async () => {
    expect(await classifyCancellationReason("Tive um imprevisto")).toBeNull();
  });

  it("keeps customer-note classification optional when no API key is configured", async () => {
    expect(await classifyCustomerNote("Preciso de acessibilidade")).toBeNull();
  });

  it("returns no waitlist ranking when TypeSafe is not configured", async () => {
    const result = await scoreWaitlistPriority([
      {
        id: "entry-1",
        serviceName: "Corte",
        startAt: "2026-10-01T12:00:00.000Z",
        createdAt: "2026-09-19T12:00:00.000Z",
        status: "pending",
        hasEmail: true,
      },
    ]);
    expect(result.size).toBe(0);
  });

  it("does not reinterpret opaque errors without TypeSafe", async () => {
    expect(await classifyOperationalError("create_booking", "database unavailable")).toBeNull();
  });

  it("does not add report insights without TypeSafe", async () => {
    expect(await classifyReportInsight({ totalBookings: 3, cancellationRate: 0, noShowRate: 0 })).toBeNull();
  });

  it("keeps semantic customer search optional", async () => {
    expect(await matchCustomersToQuery("clientes de corte", [])).toBeNull();
  });

  it("keeps natural-language service selection optional", async () => {
    expect(await selectServiceFromDescription("quero fazer a barba", [{ id: "s1", name: "Barba", description: null }])).toBeNull();
  });
});
