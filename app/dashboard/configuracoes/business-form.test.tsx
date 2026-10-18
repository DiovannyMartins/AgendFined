import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessForm } from "./business-form";
import { upsertBusiness } from "@/lib/business/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/business/actions", () => ({ upsertBusiness: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackAnalyticsEvent: vi.fn() }));

const initial = {
  name: "Barbearia Demo",
  slug: "barbearia-demo",
  phone: "11999999999",
  slotIntervalMinutes: 30,
  minNoticeMinutes: 120,
  bookingWindowDays: 60,
  timezone: "America/Sao_Paulo",
  description: null,
  plan: "free" as const,
};

describe("BusinessForm", () => {
  beforeEach(() => vi.mocked(upsertBusiness).mockReset());

  it("mostra o telefone salvo formatado", () => {
    render(<BusinessForm initial={initial} />);

    expect(screen.getByLabelText("Telefone / WhatsApp")).toHaveValue("(11) 99999-9999");
  });

  it("descarta o erro do servidor quando a validação do cliente bloqueia o próximo envio", async () => {
    vi.mocked(upsertBusiness).mockResolvedValue({
      ok: false,
      code: "VALIDATION",
      message: "A janela de reservas excede o limite do seu plano.",
      fieldErrors: { bookingWindowDays: ["O limite do seu plano é de 90 dias."] },
    });
    render(<BusinessForm initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("O limite do seu plano é de 90 dias.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "login" } });
    fireEvent.click(await screen.findByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText(/Este endereço está reservado/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("O limite do seu plano é de 90 dias.")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("A janela de reservas excede o limite do seu plano.")).not.toBeInTheDocument();
    expect(upsertBusiness).toHaveBeenCalledTimes(1);
  });
});
