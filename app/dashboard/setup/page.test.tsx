import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, redirect } = vi.hoisted(() => ({
  state: { business: null as { id: string } | null },
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => state.business }));
vi.mock("@/lib/business/actions", () => ({ createBusiness: vi.fn(), updateBusiness: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackAnalyticsEvent: vi.fn() }));

import SetupPage from "./page";

describe("setup do negócio", () => {
  beforeEach(() => {
    state.business = null;
    redirect.mockClear();
  });

  it("mostra o formulário de criação para quem ainda não tem negócio", async () => {
    render(await SetupPage());

    expect(screen.getByRole("button", { name: "Criar meu negócio" })).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redireciona para o painel quando o negócio já existe", async () => {
    state.business = { id: "biz-1" };

    await expect(SetupPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
