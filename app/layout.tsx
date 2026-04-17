import type { Metadata } from "next";

import { LanguageProvider } from "@/app/language-provider";
import { THEME_STORAGE_KEY, ThemeProvider } from "@/app/theme-provider";
import { getRequestLanguage } from "@/lib/frontend-language-server";
import { DEFAULT_FRONTEND_LANGUAGE } from "@/lib/frontend-language";

import "./globals.css";

export const metadata: Metadata = {
  title: "Optimize Check-ins",
  description: "Local dashboard for daily check-in operations.",
};

const themeBootstrapScript = `
  (() => {
    try {
      const storedTheme = window.localStorage.getItem('${THEME_STORAGE_KEY}');
      const theme = storedTheme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    }
  })();
`;

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
    <html
      lang={language === "en-US" ? "en" : "pt-BR"}
      className="h-full antialiased"
      suppressHydrationWarning
      data-theme="dark"
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <ThemeProvider>
          <LanguageProvider initialLanguage={language}>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
