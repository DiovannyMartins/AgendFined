import { choice, score, TypeSafeClient } from "@typesafe-ai/sdk";
import type { CancellationReasonCategory as CancellationReasonCategoryLabel } from "@/lib/typesafe/labels";

const TYPE_SAFE_TIMEOUT_MS = 1_500;

export const CANCELLATION_REASON_CATEGORIES = [
  "schedule_conflict",
  "illness_or_emergency",
  "price_or_budget",
  "service_issue",
  "found_alternative",
  "other",
] as const;

export type CancellationReasonCategory = CancellationReasonCategoryLabel;

export const CUSTOMER_NOTE_CATEGORIES = [
  "special_request",
  "accessibility",
  "preparation",
  "operational_information",
  "general",
] as const;

export type CustomerNoteCategory = (typeof CUSTOMER_NOTE_CATEGORIES)[number];

export type CustomerNoteJudgment = {
  category: CustomerNoteCategory;
  categoryConfidence: number;
  requiresManualFollowUp: boolean;
  followUpProbability: number;
};

export type WaitlistPriorityJudgment = {
  score: number;
  confidence: number;
};

export type OperationalErrorCategory =
  | "slot_conflict"
  | "not_found"
  | "invalid_state"
  | "permission_denied"
  | "retryable"
  | "unknown";

export type ReportInsightKind =
  | "insufficient_data"
  | "healthy"
  | "watch_cancellation_rate"
  | "watch_no_show_rate";

export type ReportInsight = {
  kind: ReportInsightKind;
  confidence: number;
};

let client: TypeSafeClient | null = null;
let configuredKey: string | null | undefined;

function getClient(): TypeSafeClient | null {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (configuredKey === (apiKey || null)) return client;

  configuredKey = apiKey || null;
  if (!configuredKey) {
    client = null;
    return client;
  }

  client = new TypeSafeClient({
    apiKey: configuredKey,
    timeout: TYPE_SAFE_TIMEOUT_MS,
    retry: { maxRetries: 0 },
  });
  return client;
}

function normalizeForClassification(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function classifyCancellationReason(
  reason: string | null | undefined,
): Promise<{ category: CancellationReasonCategory; confidence: number } | null> {
  const text = reason?.trim();
  if (!text) return null;
  const normalized = normalizeForClassification(text);
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

export async function classifyCustomerNote(note: string | null | undefined): Promise<CustomerNoteJudgment | null> {
  const text = note?.trim();
  if (!text) return null;
  const normalized = normalizeForClassification(text);
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
    followUpProbability: match ? (match[2] ? 0.86 : 0.2) : 0.1,
  };
}

export async function scoreWaitlistPriority(
  entries: Array<{
    id: string;
    serviceName: string;
    startAt: string;
    createdAt: string;
    status: string;
  }>,
): Promise<Map<string, WaitlistPriorityJudgment>> {
  const typeSafe = getClient();
  const judgments = new Map<string, WaitlistPriorityJudgment>();
  if (!typeSafe || entries.length === 0) return judgments;

  const questions = Object.fromEntries(
    entries.map((entry) => [
      entry.id,
      score(
        {
          instruction: "Qual é a prioridade operacional para o profissional tratar esta entrada agora?",
          candidate: entry,
        },
        [
          "Não deve ser tratada: não está pendente ou o horário já passou.",
          "Baixa: entrada pendente, mas distante ou sem urgência aparente.",
          "Média: merece acompanhamento normal no fluxo da lista de espera.",
          "Alta: entrada pendente com horário próximo ou espera relevante; tratar primeiro.",
        ],
      ),
    ]),
  );

  try {
    const response = await typeSafe.systemOne({
      state: { waitlist_entries: entries },
      questions,
    });
    for (const entry of entries) {
      const answer = response.answers[entry.id];
      judgments.set(entry.id, { score: answer.score, confidence: answer.confidence });
    }
  } catch {
    // AI assistance is optional; the caller keeps the deterministic created_at order.
  }

  return judgments;
}

export async function classifyOperationalError(
  operation: string,
  message: string,
): Promise<{ category: OperationalErrorCategory; confidence: number } | null> {
  const text = message.trim();
  if (!text) return null;
  const normalized = normalizeForClassification(`${operation} ${text}`);
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

export async function classifyReportInsight(report: {
  totalBookings: number;
  cancellationRate: number;
  noShowRate: number;
}): Promise<ReportInsight | null> {
  const typeSafe = getClient();
  if (!typeSafe) return null;

  try {
    const response = await typeSafe.systemOne({
      state: { report_metrics: report },
      questions: {
        insight: choice("Qual leitura operacional principal deve aparecer para o profissional?", {
          insufficient_data: "O período tem poucas ou nenhuma reserva para uma leitura confiável.",
          healthy: "Não há um sinal dominante de cancelamentos ou faltas que exija atenção.",
          watch_cancellation_rate: "A taxa de cancelamento é o sinal mais importante para acompanhar.",
          watch_no_show_rate: "A taxa de no-show é o sinal mais importante para acompanhar.",
        }),
      },
    });
    const answer = response.answers.insight;
    return { kind: answer.choice, confidence: answer.confidence };
  } catch {
    return null;
  }
}
