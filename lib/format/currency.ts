// Shared money rendering and parsing. Prices are stored as integer centavos;
// every screen shows them through formatCurrencyBRL so the app reads "R$ 49,90"
// everywhere, and the service form accepts the Brazilian "49,90" and "1.234,56"
// as well as "49.90".
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCurrencyBRL(cents: number): string {
  return BRL.format(cents / 100);
}

// A serviço's price as the cliente reads it: a free one says "Grátis" instead
// of "R$ 0,00" (#149). Money totals (relatórios, planos) keep formatCurrencyBRL.
export function formatServicePrice(cents: number): string {
  return cents === 0 ? "Grátis" : formatCurrencyBRL(cents);
}

// Whole reais, optionally grouped by dots ("1.234"), with an optional decimal
// part of one or two centavos digits. Ungrouped amounts take a comma or a dot
// ("49,90", "49.90"); grouped ones take only a comma ("1.234,56"), so the
// number of digits after a dot always says whether it groups reais or starts
// the centavos.
export const PRICE_INPUT_PATTERN = /^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/;

// Parses a price typed in reais into centavos, or null when it is not a plain
// amount. Works on the digits instead of Number() so "0,29" is 29, never 28.
export function parsePriceToCents(input: string): number | null {
  const value = input.trim();
  if (!PRICE_INPUT_PATTERN.test(value)) return null;
  const decimal = /[.,](\d{1,2})$/.exec(value);
  const reais = (decimal ? value.slice(0, decimal.index) : value).replaceAll(".", "");
  const centavos = decimal?.[1] ?? "";
  return Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
}

// Highest price a serviço accepts (R$ 100.000,00). price_cents is a Postgres
// integer, so anything far above this overflowed into a generic save error.
export const MAX_PRICE_CENTS = 10_000_000;
export const MAX_PRICE_MESSAGE = "O preço máximo é R$ 100.000,00.";

// The value used to prefill the price field when editing a service.
export function formatPriceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
