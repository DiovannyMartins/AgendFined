import { describe, expect, it, vi } from "vitest";
import { handleWebhook, type HandleWebhookDeps, type PreapprovalResource } from "./handle-webhook";

const NOW = new Date("2026-09-07T12:00:00.000Z");

function makePreapproval(status: PreapprovalResource["status"], overrides: Partial<PreapprovalResource> = {}): PreapprovalResource {
  return {
    status,
    externalReference: "biz_1",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    transactionAmount: 19.9,
    currencyId: "BRL",
    frequency: 1,
    frequencyType: "months",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<HandleWebhookDeps> = {}) {
  const deps: HandleWebhookDeps = {
    event: { type: "preapproval", dataId: "mp_1" },
    getPreapproval: vi.fn(async () => makePreapproval("authorized")),
    findSubscription: vi.fn(async () => ({
      id: "sub_1",
      businessId: "biz_1",
      mpPreapprovalId: "mp_1",
      status: "pending" as const,
      plan: "free" as const,
      gracePeriodEnd: null,
    })),
    applySnapshot: vi.fn(async (input) => ({
      subscriptionId: input.subscriptionId,
      businessId: input.businessId,
      subscriptionStatus: input.status,
      previousStatus: "pending" as const,
      applied: true,
      isCurrent: true,
      effectivePlan: input.status === "authorized" ? "pro" as const : "free" as const,
      effectiveGracePeriodEnd: input.gracePeriodEnd,
    })),
    findCurrentSubscription: vi.fn(async () => pendingSubscription("sub_1", "mp_1")),
    listOtherPendingSubscriptions: vi.fn(async () => []),
    cancelPreapproval: vi.fn(async () => undefined),
    reportDoubleCharge: vi.fn(),
    reportStalePriceCharge: vi.fn(),
    reportUnexpectedTermsCharge: vi.fn(),
    currentPriceCents: 1990,
    now: () => NOW,
    ...overrides,
  };
  return deps;
}

function pendingSubscription(id: string, mpPreapprovalId: string) {
  return { id, businessId: "biz_1", mpPreapprovalId, status: "pending" as const, gracePeriodEnd: null };
}

// A grace follows an assinatura that was paid, so these rows start authorized.
const authorizedSubscription = { ...pendingSubscription("sub_1", "mp_1"), status: "authorized" as const };

describe("handleWebhook (issue #24) lifecycle", () => {
  it("authorized marks the business pro and authorizes the subscription", async () => {
    const deps = makeDeps();
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "biz_1",
      subscriptionId: "sub_1",
      mpPreapprovalId: "mp_1",
      status: "authorized",
    }));
  });

  it("authorized clears a previous grace period", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () =>
        makePreapproval("authorized", {
          currentPeriodStart: "2026-09-01T00:00:00.000Z",
          currentPeriodEnd: "2026-10-01T00:00:00.000Z",
        }),
      ),
    });
    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "authorized",
      currentPeriodStart: "2026-09-01T00:00:00.000Z",
      currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    }));
  });

  it("paused starts a 7-day grace and keeps the plan untouched", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "paused",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    }));
  });

  it("cancelled starts a 7-day grace and keeps the plan untouched", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("cancelled")),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    }));
  });

  it("cancelled keeps the PROFISSIONAL until the end of the paid month (issue #142)", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("cancelled", { currentPeriodEnd: "2026-10-07T12:00:00.000Z" })),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      gracePeriodEnd: "2026-10-07T12:00:00.000Z",
    }));
  });

  it("cancelled keeps at least the 7-day grace when the paid period ends sooner", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("cancelled", { currentPeriodEnd: "2026-09-09T12:00:00.000Z" })),
    });
    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    }));
  });

  it("paused keeps the 7-day grace even with a next charge date ahead", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused", { currentPeriodEnd: "2026-10-07T12:00:00.000Z" })),
    });
    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "paused",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    }));
  });

  it("cancelled after a failed payment does not grant the unpaid period", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => ({ ...authorizedSubscription, status: "paused" as const })),
      getPreapproval: vi.fn(async () => makePreapproval("cancelled", { currentPeriodEnd: "2026-10-07T12:00:00.000Z" })),
    });
    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    }));
  });

  it("pending only updates the subscription status, never the plan", async () => {
    const deps = makeDeps({ getPreapproval: vi.fn(async () => makePreapproval("pending")) });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "pending" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  });

  it("ignores a non-preapproval notification without touching the database", async () => {
    const deps = makeDeps({ event: { type: "payment", dataId: "pay_1" } });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "ignored" });
    expect(deps.getPreapproval).not.toHaveBeenCalled();
    expect(deps.findSubscription).not.toHaveBeenCalled();
    expect(deps.applySnapshot).not.toHaveBeenCalled();
  });

  it("maps a preapproval fetch failure to PROVIDER_ERROR", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => {
        throw new Error("Mercado Pago preapproval fetch failed (404)");
      }),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR", message: "Mercado Pago preapproval fetch failed (404)" });
    expect(deps.applySnapshot).not.toHaveBeenCalled();
  });

  it("rejects an unregistered preapproval instead of trusting external_reference", async () => {
    const deps = makeDeps({ findSubscription: vi.fn(async () => null) });
    const result = await handleWebhook(deps);

    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN_SUBSCRIPTION",
      message: expect.any(String),
    });
    expect(deps.applySnapshot).not.toHaveBeenCalled();
  });

  it("fails when no business can be resolved", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => null),
      getPreapproval: vi.fn(async () => makePreapproval("authorized", { externalReference: null })),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: false, code: "UNKNOWN_SUBSCRIPTION", message: expect.any(String) });
    expect(deps.applySnapshot).not.toHaveBeenCalled();
  });

  it("honours a configurable grace period", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      graceDays: 3,
    });
    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "paused",
      gracePeriodEnd: "2026-09-10T12:00:00.000Z",
    }));
  });

  it("accepts the subscription_preapproval type Mercado Pago sends", async () => {
    const deps = makeDeps({ event: { type: "subscription_preapproval", dataId: "mp_1" } });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "authorized" }));
  });

  it("preserves an existing future grace period on a paused retry", async () => {
    const futureGrace = "2026-09-20T12:00:00.000Z";
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      findSubscription: vi.fn(async () => ({
        id: "sub_1",
        businessId: "biz_1",
        mpPreapprovalId: "mp_1",
        status: "paused" as const,
        plan: "free" as const,
        gracePeriodEnd: futureGrace,
      })),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "paused",
      gracePeriodEnd: futureGrace,
    }));
  });

  it("keeps a lapsed grace on a re-delivered paused webhook instead of opening a new one (issue #242)", async () => {
    const lapsedGrace = "2026-09-07T11:00:00.000Z";
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      findSubscription: vi.fn(async () => ({
        id: "sub_1",
        businessId: "biz_1",
        mpPreapprovalId: "mp_1",
        status: "paused" as const,
        plan: "pro" as const,
        gracePeriodEnd: lapsedGrace,
      })),
    });
    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "paused",
      gracePeriodEnd: lapsedGrace,
    }));
  });

  it("passes a historical subscription snapshot to the atomic apply seam without local plan writes", async () => {
    const applySnapshot = vi.fn(async () => ({
      subscriptionId: "sub_old",
      businessId: "biz_1",
      subscriptionStatus: "authorized" as const,
      previousStatus: "cancelled" as const,
      applied: true,
      isCurrent: false,
      effectivePlan: "free" as const,
      effectiveGracePeriodEnd: null,
    }));
    const deps = makeDeps({
      findSubscription: vi.fn(async () => ({
        id: "sub_old",
        businessId: "biz_1",
        mpPreapprovalId: "mp_old",
        status: "cancelled" as const,
        gracePeriodEnd: null,
      })),
      event: { type: "subscription_preapproval", dataId: "mp_old" },
      getPreapproval: vi.fn(async () => makePreapproval("authorized")),
      applySnapshot,
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: "sub_old",
      mpPreapprovalId: "mp_old",
      status: "authorized",
    }));
  });

  it("maps an atomic RPC failure to a retryable database error", async () => {
    const deps = makeDeps({
      applySnapshot: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    await expect(handleWebhook(deps)).resolves.toEqual({
      ok: false,
      code: "DATABASE_ERROR",
      message: "database unavailable",
    });
  });

  it("reapplies an identical provider snapshot without using webhook status as a local write", async () => {
    const applySnapshot = vi.fn(async (input) => ({
      subscriptionId: input.subscriptionId,
      businessId: input.businessId,
      subscriptionStatus: input.status,
      previousStatus: "pending" as const,
      applied: true,
      isCurrent: true,
      effectivePlan: "pro" as const,
      effectiveGracePeriodEnd: null,
    }));
    const deps = makeDeps({ applySnapshot });

    await handleWebhook(deps);
    await handleWebhook(deps);

    expect(applySnapshot).toHaveBeenCalledTimes(2);
    expect(applySnapshot).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: "authorized" }));
    expect(applySnapshot).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: "authorized" }));
  });
});

// The real RPC answers with the negócio's plan, still PROFISSIONAL in the carência.
const applyKeepingPro: HandleWebhookDeps["applySnapshot"] = async (input) => ({
  subscriptionId: input.subscriptionId,
  businessId: input.businessId,
  subscriptionStatus: input.status,
  previousStatus: "authorized",
  applied: true,
  isCurrent: true,
  effectivePlan: "pro",
  effectiveGracePeriodEnd: input.gracePeriodEnd,
});

describe("handleWebhook failed payment e-mail (issue #151)", () => {
  it("tells the dono once, when a paid assinatura is paused, with the end of the carência", async () => {
    const notifyPaymentFailed = vi.fn();
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      applySnapshot: vi.fn(applyKeepingPro),
      notifyPaymentFailed,
    });

    await expect(handleWebhook(deps)).resolves.toEqual({ ok: true, applied: "grace" });
    expect(notifyPaymentFailed).toHaveBeenCalledWith({ businessId: "biz_1", gracePeriodEnd: "2026-09-14T12:00:00.000Z" });
  });

  it("does not repeat the e-mail on a repeated paused notification", async () => {
    const notifyPaymentFailed = vi.fn();
    const deps = makeDeps({
      findSubscription: vi.fn(async () => ({ ...authorizedSubscription, status: "paused" as const, gracePeriodEnd: "2026-09-14T12:00:00.000Z" })),
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      applySnapshot: vi.fn(async (input) => ({ ...(await applyKeepingPro(input)), previousStatus: "paused" as const })),
      notifyPaymentFailed,
    });

    await handleWebhook(deps);
    expect(notifyPaymentFailed).not.toHaveBeenCalled();
  });

  it("tells the dono once when two deliveries of the same paused race", async () => {
    // Both deliveries read the row authorized; the database applies them one
    // after the other and the second finds it already paused.
    const notifyPaymentFailed = vi.fn();
    const previous: Array<"authorized" | "paused"> = ["authorized", "paused"];
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      applySnapshot: vi.fn(async (input) => ({ ...(await applyKeepingPro(input)), previousStatus: previous.shift()! })),
      notifyPaymentFailed,
    });

    await Promise.all([handleWebhook(deps), handleWebhook(deps)]);
    expect(notifyPaymentFailed).toHaveBeenCalledTimes(1);
  });

  it("sends nothing for a cancellation or for a checkout that was never paid", async () => {
    const notifyPaymentFailed = vi.fn();
    await handleWebhook(makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("cancelled")),
      applySnapshot: vi.fn(applyKeepingPro),
      notifyPaymentFailed,
    }));
    await handleWebhook(makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      notifyPaymentFailed,
    }));

    expect(notifyPaymentFailed).not.toHaveBeenCalled();
  });

  it("keeps the carência when the e-mail fails", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      applySnapshot: vi.fn(applyKeepingPro),
      notifyPaymentFailed: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });

    await expect(handleWebhook(deps)).resolves.toEqual({ ok: true, applied: "grace" });
  });
});

describe("handleWebhook superseded checkouts", () => {
  it("cancels the negócio's other pending checkouts once the current assinatura is authorized", async () => {
    const deps = makeDeps({
      listOtherPendingSubscriptions: vi.fn(async () => [pendingSubscription("sub_old", "mp_old")]),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.listOtherPendingSubscriptions).toHaveBeenCalledWith("biz_1", "sub_1");
    expect(deps.cancelPreapproval).toHaveBeenCalledTimes(1);
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_old");
  });

  it("answers a retryable provider error when a superseded checkout cannot be cancelled", async () => {
    const deps = makeDeps({
      listOtherPendingSubscriptions: vi.fn(async () => [pendingSubscription("sub_old", "mp_old")]),
      cancelPreapproval: vi.fn(async () => {
        throw new Error("Mercado Pago preapproval cancel failed (500)");
      }),
    });

    await expect(handleWebhook(deps)).resolves.toEqual({
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Mercado Pago preapproval cancel failed (500)",
    });
  });

  it("makes a paid old checkout the current assinatura while the current one is still pending", async () => {
    const deps = makeDeps({
      event: { type: "subscription_preapproval", dataId: "mp_old" },
      findSubscription: vi.fn(async () => pendingSubscription("sub_old", "mp_old")),
      findCurrentSubscription: vi.fn(async () => pendingSubscription("sub_new", "mp_new")),
      listOtherPendingSubscriptions: vi.fn(async () => [pendingSubscription("sub_new", "mp_new")]),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.applySnapshot).toHaveBeenCalledTimes(1);
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: "sub_old",
      status: "authorized",
      makeCurrent: { expectedCurrentSubscriptionId: "sub_new" },
    }));
    expect(deps.listOtherPendingSubscriptions).toHaveBeenCalledWith("biz_1", "sub_old");
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_new");
  });

  it("cancels a second paid checkout and reports the double charge when the current one is already authorized", async () => {
    const deps = makeDeps({
      event: { type: "subscription_preapproval", dataId: "mp_old" },
      findSubscription: vi.fn(async () => pendingSubscription("sub_old", "mp_old")),
      findCurrentSubscription: vi.fn(async () => ({
        ...pendingSubscription("sub_new", "mp_new"),
        status: "authorized" as const,
      })),
      applySnapshot: vi.fn(async (input) => ({
        subscriptionId: input.subscriptionId,
        businessId: input.businessId,
        subscriptionStatus: input.status,
        previousStatus: "pending" as const,
        applied: true,
        isCurrent: false,
        effectivePlan: "pro" as const,
        effectiveGracePeriodEnd: null,
      })),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "duplicate" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.not.objectContaining({ makeCurrent: expect.anything() }));
    expect(deps.cancelPreapproval).toHaveBeenCalledTimes(1);
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_old");
    expect(deps.reportDoubleCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_old" });
  });

  it("reports a double charge when a superseded checkout was already paid at the provider", async () => {
    const deps = makeDeps({
      listOtherPendingSubscriptions: vi.fn(async () => [
        pendingSubscription("sub_paid", "mp_paid"),
        pendingSubscription("sub_unpaid", "mp_unpaid"),
      ]),
      getPreapproval: vi.fn(async (id: string) => makePreapproval(id === "mp_unpaid" ? "pending" : "authorized")),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_paid");
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_unpaid");
    expect(deps.reportDoubleCharge).toHaveBeenCalledTimes(1);
    expect(deps.reportDoubleCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_paid" });
  });

  it("starts no grace when a checkout that was never paid is cancelled", async () => {
    const deps = makeDeps({
      event: { type: "subscription_preapproval", dataId: "mp_old" },
      findSubscription: vi.fn(async () => pendingSubscription("sub_old", "mp_old")),
      getPreapproval: vi.fn(async () => makePreapproval("cancelled")),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "closed" });
    expect(deps.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: "sub_old",
      status: "cancelled",
      gracePeriodEnd: null,
    }));
  });
});

describe("handleWebhook stale-price checkouts", () => {
  it("refuses a checkout paid below the current price: cancels it, reports a refund and grants nothing", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("authorized", { transactionAmount: 19 })),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "stale_price" });
    expect(deps.applySnapshot).not.toHaveBeenCalled();
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_1");
    expect(deps.reportStalePriceCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_1" });
  });

  it("keeps renewing an assinatura that was authorized at an older price", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      findCurrentSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("authorized", { transactionAmount: 19 })),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.cancelPreapproval).not.toHaveBeenCalled();
    expect(deps.reportStalePriceCharge).not.toHaveBeenCalled();
  });
});

describe("handleWebhook unexpected checkout terms", () => {
  it.each([
    ["a currency other than BRL", { currencyId: "USD" }],
    ["a charge that is not monthly", { frequencyType: "days" }],
    ["a charge every two months", { frequency: 2 }],
  ])("refuses a first authorization with %s: cancels it and reports a refund", async (_label, terms) => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("authorized", terms)),
    });

    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "unexpected_terms" });
    expect(deps.applySnapshot).not.toHaveBeenCalled();
    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_1");
    expect(deps.reportUnexpectedTermsCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_1" });
  });
});

describe("handleWebhook snapshot ordering", () => {
  it("passes the provider's last_modified so the database can refuse an older snapshot", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("authorized", { lastModified: "2026-09-07T11:00:00.000Z" })),
    });

    await handleWebhook(deps);

    expect(deps.applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ providerModifiedAt: "2026-09-07T11:00:00.000Z" }),
    );
  });

  it("acknowledges a snapshot older than the stored one without side effects", async () => {
    const notifyPaymentFailed = vi.fn();
    const deps = makeDeps({
      findSubscription: vi.fn(async () => authorizedSubscription),
      getPreapproval: vi.fn(async () => makePreapproval("paused", { lastModified: "2026-09-01T00:00:00.000Z" })),
      applySnapshot: vi.fn(async (input) => ({
        ...(await applyKeepingPro(input)),
        subscriptionStatus: "authorized" as const,
        applied: false,
        effectiveGracePeriodEnd: null,
      })),
      listOtherPendingSubscriptions: vi.fn(async () => [pendingSubscription("sub_2", "mp_2")]),
      notifyPaymentFailed,
    });

    await expect(handleWebhook(deps)).resolves.toEqual({ ok: true, applied: "stale" });
    expect(notifyPaymentFailed).not.toHaveBeenCalled();
    expect(deps.listOtherPendingSubscriptions).not.toHaveBeenCalled();
    expect(deps.cancelPreapproval).not.toHaveBeenCalled();
  });
});
