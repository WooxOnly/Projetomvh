import type { Metadata } from "next";

import { LanguageProvider } from "@/app/language-provider";
import { getRequestLanguage } from "@/lib/frontend-language-server";
import { DEFAULT_FRONTEND_LANGUAGE } from "@/lib/frontend-language";

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
  let language = DEFAULT_FRONTEND_LANGUAGE;

  try {
    language = await getRequestLanguage();
  } catch {
    language = DEFAULT_FRONTEND_LANGUAGE;
  }

  return (
    <html lang={language === "en-US" ? "en" : "pt-BR"} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LanguageProvider initialLanguage={language}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
