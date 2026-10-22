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

// `city` names the fuso for the cliente: "Horários no fuso de Manaus (UTC−4)".
export const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", city: "Brasília", label: "Brasília / São Paulo (GMT−3)" },
  { value: "America/Cuiaba", city: "Cuiabá", label: "Cuiabá (GMT−4)" },
  { value: "America/Manaus", city: "Manaus", label: "Manaus (GMT−4)" },
  { value: "America/Rio_Branco", city: "Rio Branco", label: "Rio Branco (GMT−5)" },
  { value: "America/Noronha", city: "Fernando de Noronha", label: "Fernando de Noronha (GMT−2)" },
  { value: "UTC", city: null, label: "UTC" },
  { value: "Europe/Lisbon", city: "Lisboa", label: "Lisboa (GMT+0; GMT+1 no verão)" },
  { value: "America/New_York", city: "Nova York", label: "Nova York (GMT−5; GMT−4 no verão)" },
] as const;

// The owner sees the same label as in setup, not the IANA id (#149); a fuso
// outside the list falls back to its id.
export function timezoneLabel(timeZone: string): string {
  return TIMEZONE_OPTIONS.find((option) => option.value === timeZone)?.label ?? timeZone;
}
