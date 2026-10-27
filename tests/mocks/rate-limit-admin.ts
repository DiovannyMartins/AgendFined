// Stand-in for @/lib/supabase/admin in action tests that spend a rate limit:
// the same counting as check_booking_rate_limit inside one window (adds one,
// allows up to the limit). Use with
// vi.mock("@/lib/supabase/admin", () => import("@/tests/mocks/rate-limit-admin")).
export const rateLimitAdmin = {
  counts: new Map<string, number>(),
  failing: false,
  reset() {
    this.counts.clear();
    this.failing = false;
  },
};

export function createAdminClient() {
  return {
    rpc: async (_name: string, { p_key, p_limit }: { p_key: string; p_limit: number }) => {
      if (rateLimitAdmin.failing) return { data: null, error: { message: "rate limit unavailable" } };
      const count = (rateLimitAdmin.counts.get(p_key) ?? 0) + 1;
      rateLimitAdmin.counts.set(p_key, count);
      return { data: count <= p_limit, error: null };
    },
  };
}
