import type { Metadata } from "next";

import { LanguageProvider } from "@/app/language-provider";
import { getRequestLanguage } from "@/lib/frontend-language-server";

import "./globals.css";

export const metadata: Metadata = {
  title: "Optimize Check-ins",
  description: "Local dashboard for daily check-in operations.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = await getRequestLanguage();

  return (
    <html lang={language === "en-US" ? "en" : "pt-BR"} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LanguageProvider initialLanguage={language}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
