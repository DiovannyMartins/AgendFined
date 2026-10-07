import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
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

// Self-hosted by next/font: no render-blocking request to Google Fonts and
// no layout shift. The CSS variables keep the names used in globals.css.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["Arial", "sans-serif"],
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
  fallback: ["Georgia", "serif"],
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${instrumentSans.variable} ${instrumentSerif.variable} h-full antialiased`}
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
