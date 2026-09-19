"use server";

import { selectServiceFromDescription } from "@/lib/typesafe/judgments";

export type ServiceSearchOption = {
  id: string;
  name: string;
  description: string | null;
};

export async function suggestService(
  description: string,
  services: ServiceSearchOption[],
): Promise<{ serviceId: string; confidence: number } | null> {
  return selectServiceFromDescription(description, services);
}
