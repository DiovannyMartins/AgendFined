"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enforceServiceSearchRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { z } from "zod";

type ServiceSearchOption = {
  id: string;
  name: string;
  description: string | null;
};

// Service search is intentionally local. The request is supplied by an
// anonymous visitor and may contain personal information; it must not be sent
// to an external AI provider just to select a public service.
export async function suggestService(
  description: string,
  businessId: string,
): Promise<{ serviceId: string; confidence: number } | null> {
  const parsed = z.object({ description: z.string().trim().min(1).max(200), businessId: z.string().uuid() }).safeParse({ description, businessId });
  if (!parsed.success) return null;
  const query = parsed.data.description.toLocaleLowerCase();

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return null;
  }
  let allowed: boolean;
  try {
    allowed = await enforceServiceSearchRateLimit(supabase, await getClientIp(), businessId);
  } catch {
    return null;
  }
  if (!allowed) return null;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("is_active", true)
    .maybeSingle();
  if (businessError || !business) return null;

  const { data: services, error } = await supabase
    .from("services")
    .select("id, name, description")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name")
    .limit(100);
  if (error || !services?.length) return null;

  const queryTokens = [...tokenize(query)];
  let best: { service: ServiceSearchOption; score: number } | null = null;
  for (const service of services) {
    const text = `${service.name} ${service.description ?? ""}`.toLocaleLowerCase();
    const serviceTokens = tokenize(text);
    const matchingTokens = queryTokens.filter((token) => serviceTokens.has(token)).length;
    const phraseBonus = text.includes(query) ? 0.5 : 0;
    const score = queryTokens.length === 0 ? 0 : matchingTokens / queryTokens.length + phraseBonus;
    if (!best || score > best.score) best = { service, score };
  }

  if (!best || best.score < 0.5) return null;
  return { serviceId: best.service.id, confidence: Math.min(best.score, 1) };
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 2),
  );
}
