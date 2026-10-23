import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leaveWaitlist } from "@/lib/booking/actions";
import { LeaveWaitlist } from "./leave-waitlist";

vi.mock("@/lib/booking/actions", () => ({ leaveWaitlist: vi.fn() }));

const TOKEN = "A".repeat(43);

describe("LeaveWaitlist", () => {
  beforeEach(() => {
    vi.mocked(leaveWaitlist).mockReset();
    window.history.replaceState(null, "", `/barbearia/lista-de-espera/sair#token=${TOKEN}`);
  });

  it("captures the fragment token, scrubs it from the URL and leaves the list", async () => {
    vi.mocked(leaveWaitlist).mockResolvedValueOnce({ status: "done" });
    render(<LeaveWaitlist slug="barbearia" />);

    fireEvent.click(await screen.findByRole("button", { name: "Sair da lista de espera" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Você saiu da lista de espera");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/barbearia/lista-de-espera/sair");
    const formData = vi.mocked(leaveWaitlist).mock.calls[0][1];
    expect(formData.get("token")).toBe(TOKEN);
  });

  it("shows the generic rejection and keeps the button", async () => {
    vi.mocked(leaveWaitlist).mockResolvedValueOnce({
      status: "error",
      code: "INVALID_TOKEN",
      message: "Não foi possível sair da lista de espera por este link.",
    });
    render(<LeaveWaitlist slug="barbearia" />);

    fireEvent.click(await screen.findByRole("button", { name: "Sair da lista de espera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível sair da lista de espera por este link.");
    expect(screen.getByRole("button", { name: "Sair da lista de espera" })).toBeEnabled();
  });

  it("captures and scrubs a token that arrives by a later fragment-only navigation", async () => {
    window.history.replaceState(null, "", "/barbearia/lista-de-espera/sair");
    render(<LeaveWaitlist slug="barbearia" />);
    expect(await screen.findByRole("heading", { name: "Link inválido" })).toBeInTheDocument();

    window.history.replaceState(null, "", `/barbearia/lista-de-espera/sair#token=${TOKEN}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(await screen.findByRole("button", { name: "Sair da lista de espera" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("explains an invalid link without offering the action", async () => {
    window.history.replaceState(null, "", "/barbearia/lista-de-espera/sair#token=curto");
    render(<LeaveWaitlist slug="barbearia" />);

    expect(await screen.findByRole("heading", { name: "Link inválido" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe(""));
  });
});
