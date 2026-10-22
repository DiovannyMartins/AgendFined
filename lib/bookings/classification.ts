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
  // Every keyword starts at a word boundary, and the short whole words also end
  // at one, so "normal" or "animal" never reads as "mal", nor "valorizar" as "valor".
  const rules: Array<[CancellationReasonCategory, RegExp]> = [
    ["schedule_conflict", /\b(?:re)?agenda|\bhorario|\btrabalho|\bviagem|\bcompromisso/],
    ["illness_or_emergency", /\bdoenca|\bdoente|\bemergencia|\bimprevisto|\bsaude|\bmal\b/],
    ["price_or_budget", /\bpreco|\bcaros?\b|\bdinheiro|\borcamento|\bvalor(?:es)?\b/],
    ["service_issue", /\bproblema|\binsatisfeito|\bqualidade|\batraso|\batendimento/],
    ["found_alternative", /\boutra opcao|\balternativa|\bencontrei|\bnao preciso|\bdesisti/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(normalized));
  return { category: match?.[0] ?? "other", confidence: match ? 0.82 : 0.55 };
}

export function classifyCustomerNote(note: string | null | undefined): CustomerNoteClassification | null {
  const text = note?.trim();
  if (!text) return null;
  const normalized = normalize(text);
  // Keywords start at a word boundary ("impedido" is not a "pedido"); the
  // open-ended ones stay prefixes so "acessibilidade" still matches "acessib".
  const rules: Array<[CustomerNoteCategory, RegExp, boolean]> = [
    ["accessibility", /\bacessib|\bcadeira|\bdeficien|\blibras\b|\bmobilidade|\bsurdo/, true],
    ["preparation", /\bpreparar|\bpreparo|\bantes do atendimento/, false],
    ["operational_information", /\bchegar|\batraso|\bendereco|\bestacion|\bpagamento|\bcontato/, true],
    ["special_request", /\bpedido|\bespecial|\bprefer|\bgostaria|\balergia/, true],
  ];
  const match = rules.find(([, pattern]) => pattern.test(normalized));
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
