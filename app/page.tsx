import { redirect } from "next/navigation";

import { LanguageSwitcher } from "@/app/language-switcher";
import { LoginForm } from "@/app/login-form";
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
    <main className="min-h-screen bg-[linear-gradient(135deg,_#020617,_#0f172a_45%,_#164e63)] px-3 py-4 text-white sm:px-4 sm:py-8 lg:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 shadow-2xl shadow-cyan-950/30 backdrop-blur lg:grid-cols-[1.15fr_0.85fr]">
          <section className="hidden border-r border-white/10 bg-[radial-gradient(circle_at_top,_rgba(103,232,249,0.18),_transparent_50%),linear-gradient(180deg,_rgba(15,23,42,0.88),_rgba(2,6,23,0.98))] p-10 lg:block">
            <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">
              {pickLanguage(language, {
                pt: "Operação diária",
                en: "Daily operation",
              })}
            </p>
            <h1 className="mt-6 max-w-lg text-5xl font-semibold leading-tight">
              {pickLanguage(language, {
                pt: "Otimize check-ins e acompanhe a operação com acesso seguro.",
                en: "Optimize check-ins and manage the operation with secure access.",
              })}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
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
                  <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">
                    {pickLanguage(language, {
                      pt: "Login",
                      en: "Login",
                    })}
                  </p>
                  <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">
                    {pickLanguage(language, {
                      pt: "Acesse o painel",
                      en: "Access the dashboard",
                    })}
                  </h2>
                </div>
                <LanguageSwitcher />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {pickLanguage(language, {
                  pt: "Use seu e-mail e sua senha para entrar. Se as credenciais estiverem corretas, você será redirecionado para o dashboard.",
                  en: "Use your email and password to sign in. If the credentials are correct, you will be redirected to the dashboard.",
                })}
              </p>

              <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 sm:p-6">
                <LoginForm />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
