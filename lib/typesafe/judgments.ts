import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
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

export async function classifyCancellationReason(
  reason: string | null | undefined,
): Promise<{ category: CancellationReasonCategory; confidence: number } | null> {
  const text = reason?.trim();
  const typeSafe = getClient();
  if (!text || !typeSafe) return null;

  try {
    const response = await typeSafe.systemOne({
      state: { cancellation_reason: text },
      questions: {
        category: choice("Classifique o principal motivo do cancelamento.", {
          schedule_conflict: "Conflito de agenda, horário ou disponibilidade.",
          illness_or_emergency: "Doença, emergência ou imprevisto pessoal.",
          price_or_budget: "Preço, orçamento ou custo.",
          service_issue: "Problema ou insatisfação com o serviço ou negócio.",
          found_alternative: "A pessoa encontrou outra opção ou não precisa mais do serviço.",
          other: "Não se encaixa claramente em nenhuma categoria anterior.",
        }),
      },
    });
    const answer = response.answers.category;
    return { category: answer.choice, confidence: answer.confidence };
  } catch {
    return null;
  }
}

export async function classifyCustomerNote(note: string | null | undefined): Promise<CustomerNoteJudgment | null> {
  const text = note?.trim();
  const typeSafe = getClient();
  if (!text || !typeSafe) return null;

  try {
    const response = await typeSafe.systemOne({
      state: { customer_note: text },
      questions: {
        category: choice("Classifique o tipo principal desta observação da reserva.", {
          special_request: "Pedido especial sobre a forma de atendimento.",
          accessibility: "Necessidade de acessibilidade ou adaptação do atendimento.",
          preparation: "Instrução sobre preparação antes do atendimento.",
          operational_information: "Informação prática que o profissional precisa considerar.",
          general: "Observação geral sem uma ação operacional clara.",
        }),
        requiresManualFollowUp: noul(
          "A observação exige que o profissional leia e faça algum acompanhamento manual antes do atendimento?",
          {
            true: "Há uma necessidade, pedido ou risco operacional que não deve ser ignorado.",
            false: "A observação é informativa e não exige acompanhamento manual.",
          },
        ),
      },
    });
    const category = response.answers.category;
    const followUp = response.answers.requiresManualFollowUp;
    return {
      category: category.choice,
      categoryConfidence: category.confidence,
      requiresManualFollowUp: followUp.noul >= 0.8,
      followUpProbability: followUp.noul,
    };
  } catch {
    return null;
  }
}

export async function scoreWaitlistPriority(
  entries: Array<{
    id: string;
    serviceName: string;
    startAt: string;
    createdAt: string;
    status: string;
    hasEmail: boolean;
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
  const typeSafe = getClient();
  const text = message.trim();
  if (!typeSafe || !text) return null;

  try {
    const response = await typeSafe.systemOne({
      state: { operation, provider_error: text },
      questions: {
        category: choice("Qual categoria operacional melhor descreve este erro opaco?", {
          slot_conflict: "O horário ou intervalo entrou em conflito com outra reserva ou bloqueio.",
          not_found: "A reserva, entrada ou recurso não foi encontrado.",
          invalid_state: "O recurso existe, mas sua situação atual não permite esta operação.",
          permission_denied: "A operação foi recusada por autorização, propriedade ou plano.",
          retryable: "Falha transitória de banco, rede ou provedor; tentar novamente pode resolver.",
          unknown: "Não há evidência suficiente para uma categoria específica.",
        }),
      },
    });
    const answer = response.answers.category;
    return { category: answer.choice, confidence: answer.confidence };
  } catch {
    return null;
  }
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

export async function matchCustomersToQuery(
  query: string,
  customers: Array<{
    id: string;
    name: string;
    bookings: Array<{ serviceName: string; status: string; startAt: string }>;
  }>,
): Promise<{ ids: string[]; confidence: number } | null> {
  const typeSafe = getClient();
  const text = query.trim();
  if (!typeSafe || !text || customers.length === 0 || customers.length > 100) return null;

  const questions = Object.fromEntries(
    customers.map((customer) => [
      customer.id,
      noul(
        {
          instruction: "Este cliente corresponde à busca semântica do profissional?",
          query: text,
          candidate: customer,
        },
        {
          true: "O cliente corresponde claramente ao sentido da busca, considerando identidade e histórico de reservas.",
          false: "O cliente não corresponde ao sentido da busca.",
        },
      ),
    ]),
  );

  try {
    const response = await typeSafe.systemOne({
      state: { query: text, customers },
      questions,
    });
    const answers = customers.map((customer) => response.answers[customer.id]);
    const confidence = answers.length === 0 ? 0 : answers.reduce((sum, answer) => sum + Math.max(answer.noul, 1 - answer.noul), 0) / answers.length;
    return {
      ids: customers.filter((customer) => response.answers[customer.id].noul >= 0.75).map((customer) => customer.id),
      confidence,
    };
  } catch {
    return null;
  }
}

export async function selectServiceFromDescription(
  description: string,
  services: Array<{ id: string; name: string; description: string | null }>,
): Promise<{ serviceId: string; confidence: number } | null> {
  const typeSafe = getClient();
  const text = description.trim();
  if (!typeSafe || !text || services.length === 0) return null;

  const criteria = Object.fromEntries(
    services.map((service) => [
      service.id,
      {
        name: service.name,
        description: service.description ?? "Sem descrição adicional.",
      },
    ]),
  );

  try {
    const response = await typeSafe.systemOne({
      state: { requested_service: text },
      questions: {
        service: choice("Qual serviço cadastrado melhor corresponde ao pedido? Escolha apenas entre os candidatos.", {
          ...criteria,
          no_match: "Nenhum serviço cadastrado corresponde claramente ao pedido.",
        }),
      },
    });
    const answer = response.answers.service;
    if (answer.choice === "no_match" || answer.confidence < 0.75) return null;
    return { serviceId: answer.choice, confidence: answer.confidence };
  } catch {
    return null;
  }
}
