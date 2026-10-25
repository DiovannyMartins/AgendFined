import { describe, expect, it } from "vitest";
import {
  buildPrivateConfirmationPath,
  buildPrivateConfirmationUrl,
  moveConfirmationToSlug,
  readCancelTokenFromHash,
  readConfirmationEmailStatus,
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
      buildPrivateConfirmationUrl(new URL("https://agenda.example/base"), "barbearia", "65925DBB", TOKEN),
    );

    expect(url.origin).toBe("https://agenda.example");
    expect(url.searchParams.has("cancel")).toBe(false);
    expect(readCancelTokenFromHash(url.hash)).toBe(TOKEN);
  });

  // #187: only the navigation right after a failed e-mail carries the warning;
  // the link inside the e-mail never does.
  it("marks in the fragment that the confirmação e-mail was not sent", () => {
    const path = buildPrivateConfirmationPath("barbearia", "65925DBB", TOKEN, { confirmationEmail: "failed" });
    const url = new URL(path, "https://agenda.example");

    expect(readCancelTokenFromHash(url.hash)).toBe(TOKEN);
    expect(readConfirmationEmailStatus(url.hash)).toBe("failed");
    expect(url.searchParams.toString()).toBe("code=65925DBB");
    expect(readConfirmationEmailStatus(new URL(buildPrivateConfirmationPath("barbearia", "65925DBB", TOKEN), "https://agenda.example").hash)).toBe("sent");
    expect(
      readConfirmationEmailStatus(
        new URL(buildPrivateConfirmationUrl(new URL("https://agenda.example"), "barbearia", "65925DBB", TOKEN)).hash,
      ),
    ).toBe("sent");
  });

  // #195: a reserva without e-mail has no later link at all, and that is not a failure.
  it("marks in the fragment that the cliente gave no e-mail", () => {
    const path = buildPrivateConfirmationPath("barbearia", "65925DBB", TOKEN, { confirmationEmail: "none" });
    const url = new URL(path, "https://agenda.example");

    expect(readCancelTokenFromHash(url.hash)).toBe(TOKEN);
    expect(readConfirmationEmailStatus(url.hash)).toBe("none");
    expect(buildPrivateConfirmationPath("barbearia", "65925DBB", TOKEN, { confirmationEmail: "sent" })).toBe(
      buildPrivateConfirmationPath("barbearia", "65925DBB", TOKEN),
    );
  });

  it("rejects malformed capabilities from the fragment", () => {
    expect(readCancelTokenFromHash("#cancel=short")).toBeNull();
    expect(readCancelTokenFromHash("#other=value")).toBeNull();
  });

  it("can consume a legacy query capability so the client can scrub old links", () => {
    expect(readPrivateCancelCapability("", `?code=65925DBB&cancel=${TOKEN}`)).toBe(TOKEN);
  });
});

// #124: trocar o slug não pode quebrar links de confirmação já enviados.
describe("moveConfirmationToSlug", () => {
  it("moves an old-slug private link to the current slug keeping code and capability", () => {
    const sent = buildPrivateConfirmationUrl(new URL("https://agenda.example"), "barbearia-demo", "AHTGQ1FY", TOKEN);

    const url = new URL(moveConfirmationToSlug(sent, "barbearia-demo-nova"));

    expect(url.origin).toBe("https://agenda.example");
    expect(url.pathname).toBe("/barbearia-demo-nova/confirmacao");
    expect(url.searchParams.get("code")).toBe("AHTGQ1FY");
    expect(readCancelTokenFromHash(url.hash)).toBe(TOKEN);
  });

  it("keeps legacy query capabilities so the destination can consume and scrub them", () => {
    const url = new URL(
      moveConfirmationToSlug(`https://agenda.example/antigo/confirmacao?code=AHTGQ1FY&cancel=${TOKEN}`, "novo"),
    );

    expect(url.pathname).toBe("/novo/confirmacao");
    expect(readPrivateCancelCapability(url.hash, url.search)).toBe(TOKEN);
  });
});
