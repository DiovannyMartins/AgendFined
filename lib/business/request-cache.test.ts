import { beforeEach, describe, expect, it, vi } from "vitest";

// React.cache only memoizes inside a server render; outside one (vitest) it is
// a passthrough. This stand-in models one request's scope (#214).
const { calls, memo } = vi.hoisted(() => ({
  calls: { auth: 0, tables: [] as string[], rpcs: [] as string[] },
  memo: new Map<unknown, Map<string, unknown>>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const store = new Map<string, unknown>();
    memo.set(fn, store);
    return (...args: A) => {
      const key = JSON.stringify(args);
      if (!store.has(key)) store.set(key, fn(...args));
      return store.get(key) as R;
    };
  },
}));

const BUSINESS = { id: "biz-1", current_subscription_id: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        calls.auth += 1;
        return { data: { user: { id: "user-1" } } };
      },
    },
    from: (table: string) => {
      calls.tables.push(table);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: BUSINESS }) }) }) };
    },
    rpc: async (fn: string) => {
      calls.rpcs.push(fn);
      return { data: true, error: null };
    },
  }),
}));

import { getCurrentUser } from "@/lib/auth/current-user";
import { getSubscription } from "@/lib/billing/get-subscription";
import { getCurrentBusiness } from "./queries";

describe("painel request cache", () => {
  beforeEach(() => {
    calls.auth = 0;
    calls.tables = [];
    calls.rpcs = [];
    memo.forEach((store) => store.clear());
  });

  it("asks Auth once and reads businesses once per painel render", async () => {
    // Layout: user, then negócio; page: negócio again.
    await getCurrentUser();
    await getCurrentBusiness();
    await getCurrentBusiness();

    expect(calls.auth).toBe(1);
    expect(calls.rpcs).toEqual(["business_has_access"]);
    expect(calls.tables).toEqual(["businesses"]);
  });

  it("does not query subscriptions for a negócio without an assinatura", async () => {
    const business = await getCurrentBusiness();
    const result = await getSubscription({
      id: business!.id,
      currentSubscriptionId: business!.current_subscription_id,
    });

    expect(result).toEqual({ subscription: null, graceSubscription: null });
    expect(calls.tables).toEqual(["businesses"]);
  });
});
