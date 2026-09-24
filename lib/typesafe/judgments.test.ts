import { describe, expect, it } from "vitest";
import {
  classifyCancellationReason,
  classifyCustomerNote,
  classifyOperationalError,
  classifyReportInsight,
  scoreWaitlistPriority,
} from "@/lib/typesafe/judgments";

describe("TypeSafe judgments", () => {
  it("classifies cancellation reasons locally without sending free text to TypeSafe", async () => {
    await expect(classifyCancellationReason("Tive um imprevisto de saúde")).resolves.toMatchObject({
      category: "illness_or_emergency",
    });
  });

  it("classifies customer notes locally without sending free text to TypeSafe", async () => {
    await expect(classifyCustomerNote("Preciso de acessibilidade")).resolves.toMatchObject({
      category: "accessibility",
      requiresManualFollowUp: true,
    });
  });

  it("returns no waitlist ranking when TypeSafe is not configured", async () => {
    const result = await scoreWaitlistPriority([
      {
        id: "entry-1",
        serviceName: "Corte",
        startAt: "2026-10-01T12:00:00.000Z",
        createdAt: "2026-09-19T12:00:00.000Z",
        status: "pending",
      },
    ]);
    expect(result.size).toBe(0);
  });

  it("classifies known operational errors locally", async () => {
    await expect(classifyOperationalError("create_booking", "database unavailable")).resolves.toMatchObject({
      category: "retryable",
    });
  });

  it("does not add report insights without TypeSafe", async () => {
    expect(await classifyReportInsight({ totalBookings: 3, cancellationRate: 0, noShowRate: 0 })).toBeNull();
  });

});
