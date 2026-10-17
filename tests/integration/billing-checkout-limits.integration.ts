import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "./index";

// Every checkout an owner starts costs a Mercado Pago call made with the
// AgendFined credential and leaves a pending row the webhook cleanup and the
// repricing walk through. The limits behind it run against the real database.
const stamp = Date.now().toString().slice(-8);
const PROBE = `probe-${stamp}`;

let admin: ReturnType<typeof adminClient>;

async function check(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("check_booking_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`rate limit: ${error.message}`);
  return data;
}

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  await admin.from("booking_rate_limits").delete().like("key", `${PROBE}%`);
});

describe("check_booking_rate_limit", () => {
  it("keeps counting a daily window while shorter windows are checked", async () => {
    const daily = `${PROBE}:daily`;
    expect(await check(daily, 2, 86_400)).toBe(true);
    expect(await check(daily, 2, 86_400)).toBe(true);

    // A 15-minute window checked in between, like any login or webhook.
    expect(await check(`${PROBE}:short`, 5, 900)).toBe(true);

    expect(await check(daily, 2, 86_400)).toBe(false);
  });
});
