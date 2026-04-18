import { redirect } from "next/navigation";

import { LanguageSwitcher } from "@/app/language-switcher";
import { LoginForm } from "@/app/login-form";
import { ThemeToggle } from "@/app/theme-toggle";
import { getSession } from "@/lib/auth/session";
import { DEFAULT_FRONTEND_LANGUAGE, pickLanguage } from "@/lib/frontend-language";
import { getRequestLanguage } from "@/lib/frontend-language-server";

export default async function Home() {
  let session = null;
  let language = DEFAULT_FRONTEND_LANGUAGE;

  try {
    [session, language] = await Promise.all([getSession(), getRequestLanguage()]);
  } catch {
    session = null;
    language = DEFAULT_FRONTEND_LANGUAGE;
  }

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="theme-auth-bg min-h-screen px-3 py-4 sm:px-4 sm:py-8 lg:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <div className="theme-auth-shell grid w-full overflow-hidden rounded-[2rem] lg:grid-cols-[1.15fr_0.85fr]">
          <section className="theme-auth-hero hidden p-10 lg:block">
            <p className="theme-accent text-sm uppercase tracking-[0.4em]">
              {pickLanguage(language, {
                pt: "Operação diária",
                en: "Daily operation",
              })}
            </p>
            <h1 className="theme-heading mt-6 max-w-lg text-5xl font-semibold leading-tight">
              {pickLanguage(language, {
                pt: "Otimize check-ins e acompanhe a operação com acesso seguro.",
                en: "Optimize check-ins and manage the operation with secure access.",
              })}
            </h1>
            <p className="theme-text-muted mt-6 max-w-xl text-base leading-7">
              {pickLanguage(language, {
                pt: "Entre para gerenciar uploads, gerentes de propriedades e condomínios em um fluxo autenticado pronto para crescer com o restante do sistema.",
                en: "Sign in to manage uploads, property managers, and resorts in an authenticated workflow ready to grow with the rest of the system.",
              })}
            </p>
          </section>

          <section className="p-5 sm:p-8 lg:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="theme-accent text-sm uppercase tracking-[0.4em]">
                    {pickLanguage(language, {
                      pt: "Login",
                      en: "Login",
                    })}
                  </p>
                  <h2 className="theme-heading mt-4 text-2xl font-semibold sm:text-3xl">
                    {pickLanguage(language, {
                      pt: "Acesse o painel",
                      en: "Access the dashboard",
                    })}
                  </h2>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <ThemeToggle />
                  <LanguageSwitcher />
                </div>
              </div>
              <p className="theme-text-muted mt-3 text-sm leading-6">
                {pickLanguage(language, {
                  pt: "Use seu e-mail e sua senha para entrar. Se as credenciais estiverem corretas, você será redirecionado para o dashboard.",
                  en: "Use your email and password to sign in. If the credentials are correct, you will be redirected to the dashboard.",
                })}
              </p>

              <div className="theme-card mt-8 rounded-[1.75rem] p-4 sm:p-6">
                <LoginForm />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
