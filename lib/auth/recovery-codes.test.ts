import { describe, expect, it } from "vitest";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "./recovery-codes";

const USER_ID = "7f3c1a52-8f4e-4c55-9d1e-0a6b2f1c9e10";

describe("generateRecoveryCodes (#169)", () => {
  it("gera dez códigos distintos no formato XXXXX-XXXXX em Crockford", () => {
    const { codes } = generateRecoveryCodes(USER_ID);

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it("guarda só o digest de cada código, ligado ao usuário", () => {
    const { codes, hashes } = generateRecoveryCodes(USER_ID);

    expect(hashes).toEqual(codes.map((code) => hashRecoveryCode(USER_ID, normalizeRecoveryCode(code)!)));
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes.join()).not.toContain(normalizeRecoveryCode(codes[0])!);
  });
});

describe("normalizeRecoveryCode (#169)", () => {
  it("aceita o código digitado em minúsculas, sem hífen ou com espaços", () => {
    expect(normalizeRecoveryCode("ab12c-de34f")).toBe("AB12CDE34F");
    expect(normalizeRecoveryCode(" AB12C DE34F ")).toBe("AB12CDE34F");
  });

  it("lê as letras parecidas com dígitos como o Crockford", () => {
    expect(normalizeRecoveryCode("oIl23-45678")).toBe("0112345678");
  });

  it.each(["", "AB12C-DE34", "AB12C-DE34FG", "AB12C-DE34U", "123456"])("recusa %j", (input) => {
    expect(normalizeRecoveryCode(input)).toBeNull();
  });
});

describe("hashRecoveryCode (#169)", () => {
  it("dá digests diferentes ao mesmo código de usuários diferentes", () => {
    expect(hashRecoveryCode(USER_ID, "AB12CDE34F")).not.toBe(
      hashRecoveryCode("0b9e3c4d-1111-4c55-9d1e-0a6b2f1c9e10", "AB12CDE34F"),
    );
  });
});
