import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Shown where a suspended negócio (ADR 0013) reaches something that needs
// access: reports, the waitlist management, a new or rescheduled reserva. It
// explains the suspension and points to the "Plano" section, where the dono
// subscribes. Nothing is lost while suspended, so the copy says so.
export function SuspendedPrompt({
  title = "Seu negócio está suspenso",
  description = "Seus dados continuam guardados. Assine o Plano AgendFined para voltar a usar este recurso.",
  ctaLabel = "Assinar",
  ctaHref = "/dashboard/configuracoes#plano",
  compact = false,
}: {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  // A one-line notice for pages whose main content must stay above the fold
  // (e.g. the agenda), instead of the full-height card.
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Link href={ctaHref} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}>
          {ctaLabel}
        </Link>
      </div>
    );
  }

  return (
    <Card className="mx-auto mt-6 max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="size-6 text-primary" />
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
