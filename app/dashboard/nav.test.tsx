import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardNav } from "./nav";

const { navigation } = vi.hoisted(() => ({ navigation: { pathname: "/dashboard" } }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
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

describe("DashboardNav: seção atual", () => {
  it("mantém Reservas marcada na página de nova reserva (#193)", () => {
    navigation.pathname = "/dashboard/agenda/nova";
    render(<DashboardNav slug="estudio" />);

    expect(screen.getByRole("link", { name: "Reservas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
    navigation.pathname = "/dashboard";
  });
});
