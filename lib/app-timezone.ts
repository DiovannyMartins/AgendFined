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

export const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "Brasília / São Paulo (GMT−3)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT−4)" },
  { value: "America/Manaus", label: "Manaus (GMT−4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT−5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT−2)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/Lisbon", label: "Lisboa" },
  { value: "America/New_York", label: "Nova York" },
] as const;
