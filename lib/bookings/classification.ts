export type CancellationReasonCategory =
  | "schedule_conflict"
  | "illness_or_emergency"
  | "price_or_budget"
  | "service_issue"
  | "found_alternative"
  | "other";

export const CANCELLATION_REASON_CATEGORY_LABELS: Record<CancellationReasonCategory, string> = {
  schedule_conflict: "conflito de agenda",
  illness_or_emergency: "doença ou imprevisto",
  price_or_budget: "preço ou orçamento",
  service_issue: "problema no serviço",
  found_alternative: "outra opção",
  other: "outro motivo",
};

export const CUSTOMER_NOTE_CATEGORIES = [
  "special_request",
  "accessibility",
  "preparation",
  "operational_information",
  "general",
] as const;

export type CustomerNoteCategory = (typeof CUSTOMER_NOTE_CATEGORIES)[number];

export type CustomerNoteClassification = {
  category: CustomerNoteCategory;
  categoryConfidence: number;
  requiresManualFollowUp: boolean;
};

export type OperationalErrorCategory =
  | "slot_conflict"
  | "not_found"
  | "invalid_state"
  | "permission_denied"
  | "retryable"
  | "unknown";

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function classifyCancellationReason(
  reason: string | null | undefined,
): { category: CancellationReasonCategory; confidence: number } | null {
  const text = reason?.trim();
  if (!text) return null;
  const normalized = normalize(text);
  const rules: Array<[CancellationReasonCategory, string[]]> = [
    ["schedule_conflict", ["agenda", "horario", "trabalho", "viagem", "compromisso"]],
    ["illness_or_emergency", ["doenca", "doente", "emergencia", "imprevisto", "saude", "mal"]],
    ["price_or_budget", ["preco", "caro", "dinheiro", "orcamento", "valor"]],
    ["service_issue", ["problema", "insatisfeito", "qualidade", "atraso", "atendimento"]],
    ["found_alternative", ["outra opcao", "alternativa", "encontrei", "nao preciso", "desisti"]],
  ];
  const match = rules.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return { category: match?.[0] ?? "other", confidence: match ? 0.82 : 0.55 };
}

export function classifyCustomerNote(note: string | null | undefined): CustomerNoteClassification | null {
  const text = note?.trim();
  if (!text) return null;
  const normalized = normalize(text);
  const rules: Array<[CustomerNoteCategory, string[], boolean]> = [
    ["accessibility", ["acessib", "cadeira", "deficien", "libras", "mobilidade", "surdo"], true],
    ["preparation", ["preparar", "preparo", "antes do atendimento"], false],
    ["operational_information", ["chegar", "atraso", "endereco", "estacion", "pagamento", "contato"], true],
    ["special_request", ["pedido", "especial", "prefer", "gostaria", "alergia"], true],
  ];
  const match = rules.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return {
    category: match?.[0] ?? "general",
    categoryConfidence: match ? 0.82 : 0.55,
    requiresManualFollowUp: match?.[2] ?? false,
  };
}

export function classifyOperationalError(
  operation: string,
  message: string,
): { category: OperationalErrorCategory; confidence: number } | null {
  const text = message.trim();
  if (!text) return null;
  const normalized = normalize(`${operation} ${text}`);
  const rules: Array<[OperationalErrorCategory, RegExp]> = [
    ["slot_conflict", /overlap|conflit|slot|23p01/],
    ["not_found", /not found|nao encontrado|nao existe|entry_not_found/],
    ["invalid_state", /already|ja foi|cancelled|cancelado|invalid state|nao pode/],
    ["permission_denied", /permission|forbidden|owner|autoriz|pro required/],
    ["retryable", /timeout|temporar|network|database unavailable|connection|indisponivel/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(normalized));
  return match ? { category: match[0], confidence: 0.9 } : null;
}
