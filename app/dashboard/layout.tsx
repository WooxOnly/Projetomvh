import { LanguageSwitcher } from "@/app/language-switcher";
import { LogoutButton } from "@/app/logout-button";
import { DashboardSectionNav } from "@/app/dashboard-section-nav";
import { requireSession } from "@/lib/auth/session";
import { pickLanguage } from "@/lib/frontend-language";
import { getRequestLanguage } from "@/lib/frontend-language-server";
import {
  triggerActiveUploadLocationMaintenance,
  triggerDailyLocationMaintenanceIfDue,
} from "@/lib/operations/location-maintenance";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, language] = await Promise.all([requireSession(), getRequestLanguage()]);
  triggerDailyLocationMaintenanceIfDue();
  triggerActiveUploadLocationMaintenance();

  return (
    <main className="mobile-width-guard min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617_55%)] px-3 py-4 text-white sm:px-4 sm:py-6 lg:py-10">
      <div className="mobile-width-guard mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl items-start">
        <section className="mobile-safe-bottom mobile-width-guard w-full rounded-[1.5rem] border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-[2rem] sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between md:pb-6">
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
                    {pickLanguage(language, {
                      pt: "Dashboard",
                      en: "Dashboard",
                    })}
                  </p>
                  <LanguageSwitcher />
                </div>
                <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                  {pickLanguage(language, {
                    pt: "Otimizar Check-ins",
                    en: "Optimize Check-ins",
                  })}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  {pickLanguage(language, {
                    pt: "Área autenticada pronta para acompanhar a operação e trabalhar o fluxo do dia.",
                    en: "Authenticated area ready to monitor the operation and work through the daily flow.",
                  })}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/30 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                      {pickLanguage(language, {
                        pt: "Sessão",
                        en: "Session",
                      })}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {session.name} | {session.email}
                    </p>
                  </div>
                  <div className="-mx-1">
                    <DashboardSectionNav />
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto">
              <LogoutButton />
            </div>
          </div>

          {children}
        </section>
      </div>
    </main>
  );
}
