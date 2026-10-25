import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { SupportWidget } from "@/components/support-widget";
import { GoogleAnalytics } from "@/components/google-analytics";
import { LoginAnalyticsTracker } from "@/components/login-analytics-tracker";
import { SpeedInsights } from "@/components/speed-insights";

export const viewport: Viewport = {
  themeColor: "#141414",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://agendfined.com.br"),
  title: "AgendFined — Agendamentos online para profissionais",
  description:
    "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
  // No canonical here: every page inherits it, and a canonical pointing at the
  // home tells search engines /privacidade and /termos are copies of it. Each
  // indexable page declares its own; noindex pages need none.
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "AgendFined",
    title: "AgendFined — Agendamentos online para profissionais",
    description:
      "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
    url: "https://agendfined.com.br",
    images: [{ url: "/brand/social.png", width: 1200, height: 630, alt: "AgendFined — Agendamentos online para profissionais" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgendFined — Agendamentos online para profissionais",
    description:
      "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
    images: ["/brand/social.png"],
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="pt-BR"
      className={`${instrumentSans.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SupportWidget />
        <GoogleAnalytics nonce={nonce} />
        <LoginAnalyticsTracker />
        <SpeedInsights />
      </body>
    </html>
  );
}
