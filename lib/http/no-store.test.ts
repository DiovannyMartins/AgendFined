// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { withNoStore } from "./no-store";

describe("withNoStore", () => {
  it("marks JSON answers and redirects as no-store", async () => {
    const json = withNoStore(async () => NextResponse.json({ ok: true }, { headers: { "Cache-Control": "public, max-age=60" } }));
    const redirect = withNoStore(async (to: string) => NextResponse.redirect(to));

    expect((await json()).headers.get("Cache-Control")).toBe("no-store");
    const response = await redirect("https://agenda.example/dashboard");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("location")).toBe("https://agenda.example/dashboard");
  });
});
