import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SupportWidget } from "./support-widget";

function openWidget() {
  render(<SupportWidget />);
  fireEvent.click(screen.getByRole("button", { name: "Suporte" }));
}

describe("SupportWidget", () => {
  it("offers Gmail, Outlook and the default mail app", async () => {
    openWidget();

    expect(await screen.findByRole("link", { name: "Abrir no Gmail" })).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/?view=cm&fs=1&to=agendfined%40outlook.com&su=Suporte%20AgendFined",
    );
    expect(screen.getByRole("link", { name: "Abrir no Outlook" })).toHaveAttribute(
      "href",
      "https://outlook.live.com/mail/0/deeplink/compose?to=agendfined%40outlook.com&subject=Suporte%20AgendFined",
    );
    expect(screen.getByRole("link", { name: "Outro app de e-mail" })).toHaveAttribute(
      "href",
      "mailto:agendfined@outlook.com?subject=Suporte%20AgendFined",
    );
  });

  it("copies the support email", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    openWidget();

    fireEvent.click(await screen.findByRole("button", { name: "Copiar" }));

    expect(writeText).toHaveBeenCalledWith("agendfined@outlook.com");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copiado!" })).toBeInTheDocument());
  });
});
