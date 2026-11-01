import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermosPage from "./page";
import PrivacidadePage from "../privacidade/page";

// Spec 007 FR-016 and SC-005: the Termos describe the plano único, the teste
// grátis and the suspensão, and say nothing of the plano Grátis.
describe("Termos de Uso", () => {
  it("cobre o teste grátis, a primeira cobrança no fim do teste e a suspensão", () => {
    const { container } = render(<TermosPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/teste grátis de 30 dias corridos/);
    expect(text).toMatch(/sem cadastro de cartão/);
    expect(text).toMatch(/concedido uma única\s+vez/);
    expect(text).toMatch(/a primeira cobrança acontece na\s+data do fim do teste/);
    expect(text).toMatch(/terminar no mesmo dia da\s+assinatura, a primeira cobrança é feita na hora/);
    expect(text).toMatch(/o negócio fica suspenso\. Nada é apagado/);
    expect(text).toMatch(/As reservas já marcadas continuam valendo/);
    expect(text).toMatch(/por no mínimo 7 dias/);
    expect(text).not.toMatch(/PROFISSIONAL|[Pp]lano Grátis/);
    expect(screen.getByText("Última atualização: 1º de novembro de 2026")).toBeInTheDocument();
  });
});

describe("Política de Privacidade", () => {
  it("explica o registro dos testes concedidos por hash do telefone e do e-mail", () => {
    const { container } = render(<PrivacidadePage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/o telefone do negócio e o e-mail do dono em forma de hash/);
    expect(text).toMatch(/mantido mesmo depois da exclusão da conta/);
    expect(text).not.toMatch(/PROFISSIONAL/);
  });
});
