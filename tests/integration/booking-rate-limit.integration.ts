import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE, SUPABASE_URL, adminClient } from "./index";
import type { Database } from "@/lib/supabase/database-types";

// #188: before a public write the server only reads the negócio's counter; the
// counter grows once the reserva or entrada is written.
const PROBE = `probe-peek-${Date.now().toString().slice(-8)}`;

let admin: ReturnType<typeof adminClient>;

async function rpc(name: "check_booking_rate_limit" | "peek_booking_rate_limit", key: string, limit: number) {
  const { data, error } = await admin.rpc(name, { p_key: key, p_limit: limit, p_window_seconds: 900 });
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  await admin.from("booking_rate_limits").delete().like("key", `${PROBE}%`);
});

describe("peek_booking_rate_limit", () => {
  it("never counts, and refuses once the limit of writes is counted", async () => {
    const key = `${PROBE}:writes`;

    for (let read = 0; read < 5; read++) expect(await rpc("peek_booking_rate_limit", key, 2)).toBe(true);

    expect(await rpc("check_booking_rate_limit", key, 2)).toBe(true);
    expect(await rpc("peek_booking_rate_limit", key, 2)).toBe(true);
    expect(await rpc("check_booking_rate_limit", key, 2)).toBe(true);
    expect(await rpc("peek_booking_rate_limit", key, 2)).toBe(false);

    const { data } = await admin.from("booking_rate_limits").select("count").eq("key", key).single();
    expect(data?.count).toBe(2);
  });

  it("is not callable by anonymous clients", async () => {
    const anon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await anon.rpc("peek_booking_rate_limit", {
      p_key: `${PROBE}:anon`,
      p_limit: 1,
      p_window_seconds: 900,
    });

    expect(error).not.toBeNull();
  });
});
