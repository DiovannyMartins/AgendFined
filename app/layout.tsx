import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgendFined — Agendamentos online para profissionais",
  description:
    "Receba agendamentos online, organize seus horários e ofereça uma experiência mais profissional aos seus clientes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
