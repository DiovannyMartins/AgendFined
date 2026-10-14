import { describe, expect, it } from "vitest";
import {
  buildPrivateConfirmationPath,
  buildPrivateConfirmationUrl,
  readCancelTokenFromHash,
  readPrivateCancelCapability,
} from "./private-confirmation";

const TOKEN = "A".repeat(43);

describe("private confirmation navigation", () => {
  it("keeps the cancellation capability out of the query string", () => {
    const path = buildPrivateConfirmationPath("barbearia", "65925DBB", TOKEN);
    const url = new URL(path, "https://agenda.example");

    expect(url.pathname).toBe("/barbearia/confirmacao");
    expect(url.searchParams.get("code")).toBe("65925DBB");
    expect(url.searchParams.has("cancel")).toBe(false);
    expect(url.hash).toBe(`#cancel=${TOKEN}`);
  });

  it("builds email links with the same fragment-only capability contract", () => {
    const url = new URL(
      buildPrivateConfirmationUrl("https://agenda.example/base", "barbearia", "65925DBB", TOKEN),
    );

    expect(url.origin).toBe("https://agenda.example");
    expect(url.searchParams.has("cancel")).toBe(false);
    expect(readCancelTokenFromHash(url.hash)).toBe(TOKEN);
  });

  it("rejects malformed capabilities from the fragment", () => {
    expect(readCancelTokenFromHash("#cancel=short")).toBeNull();
    expect(readCancelTokenFromHash("#other=value")).toBeNull();
  });

  it("can consume a legacy query capability so the client can scrub old links", () => {
    expect(readPrivateCancelCapability("", `?code=65925DBB&cancel=${TOKEN}`)).toBe(TOKEN);
  });
});
