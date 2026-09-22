import Link from "next/link";
import { Crown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Upgrade prompt for a gated Pro feature (ADR 0008). Rendered when a Free
// business reaches a Pro boundary (reports, reminders, waitlist management,
// calendar export); it explains the gate and points to the dashboard plan
// section. The actual billing/upgrade flow (Mercado Pago) is a later seam, so
// the CTA lands on that section for now.
export function UpgradePrompt({
  title = "Assine o PROFISSIONAL",
  description = "Relatórios, lembretes automáticos, gestão da lista de espera e exportação de agenda são recursos do plano PROFISSIONAL.",
  ctaLabel = "Ver planos",
  ctaHref = "/dashboard/configuracoes#plano",
}: {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <Card className="mx-auto mt-6 max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Crown className="size-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Link href={ctaHref} className={cn(buttonVariants({ size: "lg" }), "px-6")}>
          {ctaLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
