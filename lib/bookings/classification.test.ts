import { describe, expect, it } from "vitest";
import { classifyCancellationReason, classifyCustomerNote } from "./classification";

describe("classifyCancellationReason", () => {
  it.each([
    ["Estou passando mal", "illness_or_emergency"],
    ["Fiquei doente", "illness_or_emergency"],
    ["Ficou caro demais", "price_or_budget"],
    ["O valor subiu", "price_or_budget"],
    ["Preciso reagendar", "schedule_conflict"],
    ["Surgiu uma viagem", "schedule_conflict"],
  ])("classifies %j as %s", (reason, category) => {
    expect(classifyCancellationReason(reason)?.category).toBe(category);
  });

  it.each(["Rotina normal", "Levar o animal ao veterinário", "Evento formal", "Quero valorizar meu tempo", "Vou de carona"])(
    "does not match a keyword inside another word: %j",
    (reason) => {
      expect(classifyCancellationReason(reason)).toEqual({ category: "other", confidence: 0.55 });
    },
  );
});

describe("classifyCustomerNote", () => {
  it("keeps prefix keywords matching longer words", () => {
    expect(classifyCustomerNote("Preciso de acessibilidade")?.category).toBe("accessibility");
    expect(classifyCustomerNote("Vou chegar 5 min antes")?.category).toBe("operational_information");
  });

  it("does not match a keyword inside another word", () => {
    expect(classifyCustomerNote("Estou impedido de subir escadas")?.category).not.toBe("special_request");
    expect(classifyCustomerNote("Fui achegar ao balcão")?.category).toBe("general");
  });
});
