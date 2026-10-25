import { describe, expect, it } from "vitest";
import { speedInsightsBeforeSend } from "./speed-insights";

describe("speedInsightsBeforeSend", () => {
  it("keeps only origin and path, dropping query and fragment", () => {
    expect(
      speedInsightsBeforeSend({
        type: "vital",
        url: "https://agendfined.com.br/barbearia?code=AB12CD34#token=secret",
        route: "/[slug]",
      }),
    ).toEqual({ type: "vital", url: "https://agendfined.com.br/barbearia", route: "/[slug]" });
  });

  it("drops pages that carry a private capability or credentials", () => {
    for (const path of ["/barbearia/confirmacao", "/barbearia/lista-de-espera/sair", "/login", "/auth/callback"]) {
      expect(speedInsightsBeforeSend({ type: "vital", url: `https://agendfined.com.br${path}#x` })).toBeNull();
    }
  });
});
