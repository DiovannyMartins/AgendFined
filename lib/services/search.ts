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
  const boundedDescription = description.trim();
  if (!boundedDescription || boundedDescription.length > 200 || services.length > 100) return null;
  return selectServiceFromDescription(
    boundedDescription,
    services.slice(0, 100).map((service) => ({
      ...service,
      name: service.name.slice(0, 80),
      description: service.description?.slice(0, 500) ?? null,
    })),
  );
}
