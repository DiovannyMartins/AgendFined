import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardNav } from "./nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/auth/actions", () => ({ logout: vi.fn() }));
vi.mock("@/components/copy-public-link", () => ({ CopyPublicLink: () => null }));

describe("DashboardNav no celular (#149)", () => {
  it("fecha o menu com Esc e devolve o foco ao botão", () => {
    render(<DashboardNav slug="estudio" />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const close = screen.getByRole("button", { name: "Fechar menu" });
    expect(close).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(screen.getByRole("link", { name: "Serviços" }), { key: "Escape" });

    const open = screen.getByRole("button", { name: "Abrir menu" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    expect(open).toHaveFocus();
  });
});
