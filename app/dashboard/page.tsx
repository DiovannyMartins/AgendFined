import { redirect } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, CalendarDays, Blocks } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentBusiness } from "@/lib/business/queries";
import { PublicLinkQR } from "@/components/public-link-qr";

export default async function DashboardHome() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const publicUrl = `/${business.slug}`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{business.name}</h1>
            <p className="mt-1 text-muted-foreground">
              Seu link público:{" "}
              <Link href={publicUrl} className="font-medium text-foreground hover:underline">
                agendfined.app/{business.slug}
              </Link>
            </p>
          </div>
          <Link
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Ver página pública
          </Link>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border p-4">
          <PublicLinkQR slug={business.slug} size={112} />
          <div className="max-w-[220px]">
            <p className="text-sm font-medium">QR Code do seu link</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Escaneie com a câmera do celular para abrir sua página pública de reservas.
            </p>
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            href: "/dashboard/servicos",
            icon: Sparkles,
            title: "Serviços",
            description: "Cadastre e gerencie seus serviços.",
            action: "Gerenciar",
          },
          {
            href: "/dashboard/agenda",
            icon: CalendarDays,
            title: "Reservas",
            description: "Acompanhe seus próximos atendimentos.",
            action: "Ver agenda",
          },
          {
            href: "/dashboard/bloqueios",
            icon: Blocks,
            title: "Bloqueios",
            description: "Pausas, férias e exceções de agenda.",
            action: "Gerenciar",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block rounded-xl ring-1 ring-foreground/10 transition-all duration-300 hover:-translate-y-1 hover:ring-primary/30 hover:shadow-2xl hover:shadow-primary/5"
          >
            <Card className="h-full ring-0 shadow-none group-hover:shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <item.icon className="size-4 text-primary" />
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{item.description}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
                  {item.action} <span aria-hidden>→</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
