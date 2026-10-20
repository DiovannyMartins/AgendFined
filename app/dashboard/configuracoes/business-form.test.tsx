import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessForm } from "./business-form";
import { updateBusiness } from "@/lib/business/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/business/actions", () => ({ createBusiness: vi.fn(), updateBusiness: vi.fn() }));
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
  beforeEach(() => vi.mocked(updateBusiness).mockReset());

  it("mostra o telefone salvo formatado", () => {
    render(<BusinessForm initial={initial} />);

    expect(screen.getByLabelText("Telefone / WhatsApp")).toHaveValue("(11) 99999-9999");
  });

  // #124 / ADR 0007: o link antigo redireciona para o novo e fica reservado ao negócio.
  it("explica o que acontece com o link antigo antes de salvar um slug novo", () => {
    render(<BusinessForm initial={initial} />);
    expect(screen.queryByText(/passa a redirecionar/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "barbearia-nova" } });

    expect(
      screen.getByText(/agendfined\.com\.br\/barbearia-demo passa a redirecionar para agendfined\.com\.br\/barbearia-nova/),
    ).toBeInTheDocument();
    expect(screen.getByText(/continua reservado para o seu negócio/)).toBeInTheDocument();
    expect(screen.queryByText(/deixa de funcionar/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "barbearia-demo" } });

    expect(screen.queryByText(/passa a redirecionar/)).not.toBeInTheDocument();
  });

  // #128: a prévia acompanha o que está sendo digitado, não o slug salvo.
  it("mostra a prévia do link com o slug digitado", () => {
    render(<BusinessForm initial={initial} />);

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "barbearia-nova" } });

    expect(screen.getByText(/Seu link: agendfined\.com\.br\/barbearia-nova/)).toBeInTheDocument();
  });

  it("é o título de nível 1 da página de configurações", () => {
    render(<BusinessForm initial={initial} />);

    expect(screen.getByRole("heading", { level: 1, name: "Configurações do negócio" })).toBeInTheDocument();
  });

  it("mostra o slug em uso junto do campo", async () => {
    vi.mocked(updateBusiness).mockResolvedValue({
      ok: false,
      code: "SLUG_TAKEN",
      message: "Revise os campos destacados.",
      fieldErrors: { slug: ["Este endereço já está em uso. Escolha outro."] },
    });
    render(<BusinessForm initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    const error = await screen.findByText("Este endereço já está em uso. Escolha outro.");
    expect(error.parentElement).toContainElement(screen.getByLabelText("Endereço público (slug)"));
  });

  it("descarta o erro do servidor quando a validação do cliente bloqueia o próximo envio", async () => {
    vi.mocked(updateBusiness).mockResolvedValue({
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
    expect(updateBusiness).toHaveBeenCalledTimes(1);
  });
});
