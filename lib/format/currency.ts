// Shared money rendering and parsing. Prices are stored as integer centavos;
// every screen shows them through formatCurrencyBRL so the app reads "R$ 49,90"
// everywhere, and the service form accepts the Brazilian "49,90" as well as "49.90".
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCurrencyBRL(cents: number): string {
  return BRL.format(cents / 100);
}

// Whole reais with an optional comma or dot followed by one or two centavos digits.
export const PRICE_INPUT_PATTERN = /^\d+([.,]\d{1,2})?$/;

// Parses a price typed in reais into centavos, or null when it is not a plain
// amount. Works on the digits instead of Number() so "0,29" is 29, never 28.
export function parsePriceToCents(input: string): number | null {
  const value = input.trim();
  if (!PRICE_INPUT_PATTERN.test(value)) return null;
  const [reais, centavos = ""] = value.split(/[.,]/);
  return Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
}

// The value used to prefill the price field when editing a service.
export function formatPriceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
