// Fuso padrão para novos negócios e compatibilidade com dados antigos.
export const APP_TIMEZONE = "America/Sao_Paulo" as const;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return Boolean(timeZone.trim());
  } catch {
    return false;
  }
}

// Every IANA fuso in Brazil, current and legacy ids. Phones are always
// Brazilian (brazilianPhoneSchema), so a negócio abroad could neither save its
// own phone nor take reservas from local clientes (#189).
const BRAZILIAN_TIMEZONES: ReadonlySet<string> = new Set([
  "America/Araguaina", "America/Bahia", "America/Belem", "America/Boa_Vista", "America/Campo_Grande",
  "America/Cuiaba", "America/Eirunepe", "America/Fortaleza", "America/Maceio", "America/Manaus",
  "America/Noronha", "America/Porto_Acre", "America/Porto_Velho", "America/Recife", "America/Rio_Branco",
  "America/Santarem", "America/Sao_Paulo", "Brazil/Acre", "Brazil/DeNoronha", "Brazil/East", "Brazil/West",
]);

export function isBrazilianTimeZone(timeZone: string): boolean {
  return BRAZILIAN_TIMEZONES.has(timeZone);
}

export const BRAZILIAN_TIMEZONE_MESSAGE = "Escolha um fuso horário do Brasil.";

// `city` names the fuso for the cliente: "Horários no fuso de Manaus (UTC−4)".
export const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", city: "Brasília", label: "Brasília / São Paulo (GMT−3)" },
  { value: "America/Cuiaba", city: "Cuiabá", label: "Cuiabá (GMT−4)" },
  { value: "America/Manaus", city: "Manaus", label: "Manaus (GMT−4)" },
  { value: "America/Rio_Branco", city: "Rio Branco", label: "Rio Branco (GMT−5)" },
  { value: "America/Noronha", city: "Fernando de Noronha", label: "Fernando de Noronha (GMT−2)" },
] as const;

// The owner sees the same label as in setup, not the IANA id (#149); a fuso
// outside the list falls back to its id.
export function timezoneLabel(timeZone: string): string {
  return TIMEZONE_OPTIONS.find((option) => option.value === timeZone)?.label ?? timeZone;
}
