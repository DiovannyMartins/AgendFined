import { describe, expect, it } from "vitest";
import { suggestSlug } from "./slug";

describe("suggestSlug", () => {
  it("tira acentos e troca espaços por hífen", () => {
    expect(suggestSlug("Estúdio Beta Teste")).toBe("estudio-beta-teste");
  });

  it("junta separadores e descarta pontuação nas pontas", () => {
    expect(suggestSlug("  Barbearia & Café — Centro!  ")).toBe("barbearia-cafe-centro");
  });

  it("respeita o limite de 50 caracteres sem terminar em hífen", () => {
    const slug = suggestSlug("Clínica de Fisioterapia e Pilates Movimento Livre Unidade Centro");

    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug).not.toMatch(/-$/);
    expect(slug.startsWith("clinica-de-fisioterapia-e-pilates")).toBe(true);
  });

  it("devolve vazio para um nome sem letras nem números", () => {
    expect(suggestSlug("!!!")).toBe("");
  });
});
