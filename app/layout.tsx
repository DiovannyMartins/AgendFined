import type { Metadata } from "next";
import "./globals.css";
import { SupportWidget } from "@/components/support-widget";
import { GoogleAnalytics } from "@/components/google-analytics";
import { LoginAnalyticsTracker } from "@/components/login-analytics-tracker";

export const metadata: Metadata = {
  metadataBase: new URL("https://agendfined.com.br"),
  title: "AgendFined — Agendamentos online para profissionais",
  description:
    "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "AgendFined",
    title: "AgendFined — Agendamentos online para profissionais",
    description:
      "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
    url: "https://agendfined.com.br",
    images: [{ url: "/images/hero.webp", width: 1600, height: 900, alt: "AgendFined" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgendFined — Agendamentos online para profissionais",
    description:
      "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
    images: ["/images/hero.webp"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SupportWidget />
        <GoogleAnalytics />
        <LoginAnalyticsTracker />
      </body>
    </html>
  );
}
