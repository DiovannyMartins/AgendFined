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
