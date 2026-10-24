import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacidadePage from "./page";

// A verificação do app OAuth pelo Google exige que a política, na página
// inicial do domínio, explique o acesso aos dados do Google e declare a
// adesão ao Uso Limitado.
describe("política de privacidade e Google Calendar", () => {
  it("explica o que a integração acessa, envia, guarda e como revogar", () => {
    render(<PrivacidadePage />);

    const section = screen.getByRole("heading", { name: /Integração com o Google Calendar/ }).closest("section");
    expect(section).toHaveTextContent("Ver e editar eventos");
    expect(section).toHaveTextContent("só os eventos que ele mesmo cria");
    expect(section).toHaveTextContent("nome e telefone do cliente");
    expect(section).toHaveTextContent("criptografados");
    expect(section).toHaveTextContent("Desconectar");
    expect(section).toHaveTextContent("myaccount.google.com/permissions");
  });

  it("declara a adesão aos requisitos de Uso Limitado do Google", () => {
    render(<PrivacidadePage />);

    const limitedUse = screen.getByRole("link", { name: "Política de Dados do Usuário dos Serviços de API do Google" });
    expect(limitedUse).toHaveAttribute("href", "https://developers.google.com/terms/api-services-user-data-policy");
    expect(limitedUse.closest("p")).toHaveTextContent("requisitos de Uso Limitado");
  });

  it("lista o Google entre os operadores com quem dados são compartilhados", () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole("heading", { name: /Compartilhamento/ }).closest("section")).toHaveTextContent(
      "Google (Google Calendar, só quando o dono conecta)",
    );
  });
});
