// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { row } = vi.hoisted(() => ({ row: { current: null as Record<string, unknown> | null } }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: row.current, error: null }),
    };
    return { from: () => query };
  },
}));

import { getGoogleCalendarConnectionStatus } from "./queries";

const connection = {
  google_email: "dono@example.com",
  calendar_id: "primary",
  calendar_timezone: "America/Sao_Paulo",
  last_sync_at: null,
  last_error: null,
};

beforeEach(() => {
  row.current = connection;
});

describe("getGoogleCalendarConnectionStatus", () => {
  // #219: the stored error text stays on the server; the painel only needs to
  // know that the last sync failed.
  it("sends only whether the last sync failed, not the stored error", async () => {
    row.current = { ...connection, last_error: "GOOGLE_CALENDAR_EVENT_UPDATE_FAILED" };

    const status = await getGoogleCalendarConnectionStatus("business", "America/Sao_Paulo");

    expect(status).toMatchObject({ syncFailed: true, needsReconnect: false });
    expect(JSON.stringify(status)).not.toContain("GOOGLE_CALENDAR_EVENT_UPDATE_FAILED");
  });

  it("flags a revoked authorization for reconnecting", async () => {
    row.current = { ...connection, last_error: "GOOGLE_CALENDAR_REAUTH_REQUIRED" };

    expect(await getGoogleCalendarConnectionStatus("business", "America/Sao_Paulo")).toMatchObject({
      syncFailed: true,
      needsReconnect: true,
    });
  });

  it("reports a healthy connection", async () => {
    expect(await getGoogleCalendarConnectionStatus("business", "America/Sao_Paulo")).toMatchObject({
      syncFailed: false,
      needsReconnect: false,
    });
  });
});
