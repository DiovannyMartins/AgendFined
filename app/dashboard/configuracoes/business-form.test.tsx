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

  // #136: o leitor de tela precisa saber qual campo falhou, não só o resumo do rodapé.
  it("liga o erro do slug em uso ao campo, preservando a dica", async () => {
    vi.mocked(updateBusiness).mockResolvedValue({
      ok: false,
      code: "SLUG_TAKEN",
      message: "Revise os campos destacados.",
      fieldErrors: { slug: ["Este endereço já está em uso. Escolha outro."] },
    });
    render(<BusinessForm initial={initial} />);
    const slugInput = screen.getByLabelText("Endereço público (slug)");
    expect(slugInput).not.toHaveAttribute("aria-invalid");

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    const error = await screen.findByText("Este endereço já está em uso. Escolha outro.");
    expect(error).toHaveAttribute("id", "slug-error");
    expect(slugInput).toHaveAttribute("aria-invalid", "true");
    expect(slugInput).toHaveAttribute("aria-describedby", "slug-hint slug-error");
    expect(slugInput).toHaveAccessibleDescription(/Seu link: .*Este endereço já está em uso\. Escolha outro\./);
    await waitFor(() => expect(slugInput).toHaveFocus());
  });

  it("marca como inválidos os campos barrados pela validação do cliente", async () => {
    render(<BusinessForm initial={initial} />);
    const nameInput = screen.getByLabelText("Nome do negócio");
    const phoneInput = screen.getByLabelText("Telefone / WhatsApp");

    fireEvent.change(nameInput, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    const error = await screen.findByText("Informe um nome com pelo menos 2 caracteres.");
    expect(error).toHaveAttribute("id", "name-error");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "name-error");
    expect(nameInput).toHaveAccessibleDescription("Informe um nome com pelo menos 2 caracteres.");
    expect(phoneInput).not.toHaveAttribute("aria-invalid");
    expect(phoneInput).not.toHaveAttribute("aria-describedby");
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  it("mantém a dica no aria-describedby dos campos numéricos com erro", async () => {
    vi.mocked(updateBusiness).mockResolvedValue({
      ok: false,
      code: "VALIDATION",
      message: "A janela de reservas excede o limite do seu plano.",
      fieldErrors: { bookingWindowDays: ["O limite do seu plano é de 90 dias."] },
    });
    render(<BusinessForm initial={initial} />);
    const windowInput = screen.getByLabelText("Janela de reservas (dias)");
    expect(windowInput).toHaveAttribute("aria-describedby", "bookingWindowDays-hint");

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await screen.findByText("O limite do seu plano é de 90 dias.");
    expect(windowInput).toHaveAttribute("aria-invalid", "true");
    expect(windowInput).toHaveAttribute("aria-describedby", "bookingWindowDays-hint bookingWindowDays-error");
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

describe("polimento pós-beta (#149)", () => {
  beforeEach(() => vi.mocked(updateBusiness).mockReset());

  it("sugere o slug a partir do nome no setup", () => {
    render(<BusinessForm initial={null} />);

    fireEvent.change(screen.getByLabelText("Nome do negócio"), { target: { value: "Estúdio Beta Teste" } });

    expect(screen.getByLabelText("Endereço público (slug)")).toHaveValue("estudio-beta-teste");
  });

  it("para de sugerir depois que o dono edita o slug", () => {
    render(<BusinessForm initial={null} />);

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "meu-estudio" } });
    fireEvent.change(screen.getByLabelText("Nome do negócio"), { target: { value: "Estúdio Beta Teste" } });

    expect(screen.getByLabelText("Endereço público (slug)")).toHaveValue("meu-estudio");
  });

  it("não troca o slug de um negócio existente ao renomear", () => {
    render(<BusinessForm initial={initial} />);

    fireEvent.change(screen.getByLabelText("Nome do negócio"), { target: { value: "Outro Nome" } });

    expect(screen.getByLabelText("Endereço público (slug)")).toHaveValue("barbearia-demo");
  });

  it("pede confirmação antes de salvar um slug novo", async () => {
    vi.mocked(updateBusiness).mockResolvedValue({ ok: true, data: undefined });
    render(<BusinessForm initial={initial} />);

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "barbearia-nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/QR Codes impressos/);
    expect(updateBusiness).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Trocar endereço" }));

    await waitFor(() => expect(updateBusiness).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateBusiness).mock.calls[0][1].get("slug")).toBe("barbearia-nova");
  });

  it("não salva quando o dono mantém o endereço atual", async () => {
    render(<BusinessForm initial={initial} />);

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "barbearia-nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    fireEvent.click(await screen.findByRole("button", { name: "Manter o endereço atual" }));

    expect(updateBusiness).not.toHaveBeenCalled();
  });

  // #179: o campo e a prévia voltam ao slug salvo, como o fuso depois de uma recusa.
  it("volta o slug para o salvo quando o dono mantém o endereço atual", async () => {
    render(<BusinessForm initial={initial} />);

    fireEvent.change(screen.getByLabelText("Endereço público (slug)"), { target: { value: "barbearia-nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    fireEvent.click(await screen.findByRole("button", { name: "Manter o endereço atual" }));

    expect(screen.getByLabelText("Endereço público (slug)")).toHaveValue("barbearia-demo");
    expect(screen.getByText(/Seu link: agendfined\.com\.br\/barbearia-demo/)).toBeInTheDocument();
    expect(screen.queryByText(/passa a redirecionar/)).not.toBeInTheDocument();
  });

  it("volta o fuso para o salvo quando o servidor recusa a troca", async () => {
    vi.mocked(updateBusiness).mockResolvedValue({
      ok: false,
      code: "TIMEZONE_HAS_BOOKINGS",
      message: "O fuso horário não pode ser alterado enquanto houver reservas futuras.",
      fieldErrors: { timezone: ["Há reservas futuras neste negócio."] },
    });
    render(<BusinessForm initial={initial} />);

    fireEvent.change(screen.getByLabelText("Fuso horário do negócio"), { target: { value: "America/Manaus" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Há reservas futuras neste negócio.")).toBeInTheDocument();
    expect(screen.getByLabelText("Fuso horário do negócio")).toHaveValue("America/Sao_Paulo");
  });
});
