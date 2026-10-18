import type { Metadata } from "next";
import { describe, expect, it } from "vitest";

// Cada rota precisa de um <title> próprio: leitores de tela e abas do navegador
// anunciam o título, e repetir o da landing esconde onde a pessoa está.
const ROUTES: [string, () => Promise<{ metadata?: Metadata }>, string][] = [
  ["/login", () => import("./(auth)/login/page"), "Entrar — AgendFined"],
  ["/cadastro", () => import("./(auth)/cadastro/page"), "Criar conta — AgendFined"],
  ["/recuperar-senha", () => import("./(auth)/recuperar-senha/page"), "Recuperar senha — AgendFined"],
  ["/redefinir-senha", () => import("./(auth)/redefinir-senha/page"), "Redefinir senha — AgendFined"],
  ["/mfa", () => import("./mfa/page"), "Autenticação em duas etapas — AgendFined"],
  ["/dashboard", () => import("./dashboard/page"), "Painel — AgendFined"],
  ["/dashboard/setup", () => import("./dashboard/setup/page"), "Configurar negócio — AgendFined"],
  ["/dashboard/servicos", () => import("./dashboard/servicos/page"), "Serviços — AgendFined"],
  ["/dashboard/agenda", () => import("./dashboard/agenda/page"), "Reservas — AgendFined"],
  ["/dashboard/clientes", () => import("./dashboard/clientes/page"), "Clientes — AgendFined"],
  ["/dashboard/relatorios", () => import("./dashboard/relatorios/page"), "Relatórios — AgendFined"],
  ["/dashboard/lista-de-espera", () => import("./dashboard/lista-de-espera/page"), "Lista de espera — AgendFined"],
  ["/dashboard/bloqueios", () => import("./dashboard/bloqueios/page"), "Bloqueios — AgendFined"],
  ["/dashboard/configuracoes", () => import("./dashboard/configuracoes/page"), "Configurações — AgendFined"],
  ["/[slug]/consultar", () => import("./[slug]/consultar/page"), "Consultar reserva — AgendFined"],
  ["/termos", () => import("./termos/page"), "Termos de Uso — AgendFined"],
  ["/privacidade", () => import("./privacidade/page"), "Política de Privacidade — AgendFined"],
];

describe("títulos de página", () => {
  it.each(ROUTES)("%s tem título próprio", async (_route, load, title) => {
    const { metadata } = await load();

    expect(metadata?.title).toBe(title);
  });

  it("não repete títulos entre rotas", () => {
    const titles = ROUTES.map(([, , title]) => title);

    expect(new Set(titles).size).toBe(titles.length);
  });
});
