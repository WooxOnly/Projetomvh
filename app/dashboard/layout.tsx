import { DashboardSectionNav } from "@/app/dashboard-section-nav";
import { LanguageSwitcher } from "@/app/language-switcher";
import { LogoutButton } from "@/app/logout-button";
import { ThemeToggle } from "@/app/theme-toggle";
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
    <main className="theme-dashboard-bg mobile-width-guard min-h-screen px-3 py-4 sm:px-4 sm:py-6 lg:py-10">
      <div className="mobile-width-guard mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl items-start">
        <section className="theme-main-shell mobile-safe-bottom mobile-width-guard w-full rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 lg:p-8">
          <div className="pb-3">
            <div className="flex justify-end">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </div>
          <div className="theme-divider flex flex-col gap-4 border-b pb-5 md:flex-row md:items-center md:justify-between md:pb-6">
            <div className="space-y-4">
              <div>
                <p className="theme-accent text-sm uppercase tracking-[0.35em]">
                  {pickLanguage(language, {
                    pt: "Dashboard",
                    en: "Dashboard",
                  })}
                </p>
                <h1 className="theme-heading mt-3 text-2xl font-semibold sm:text-3xl">
                  {pickLanguage(language, {
                    pt: "Otimizar Check-ins",
                    en: "Optimize Check-ins",
                  })}
                </h1>
                <p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">
                  {pickLanguage(language, {
                    pt: "Área autenticada pronta para acompanhar a operação e trabalhar o fluxo do dia.",
                    en: "Authenticated area ready to monitor the operation and work through the daily flow.",
                  })}
                </p>
              </div>

              <div className="theme-surface-strong rounded-[1.25rem] px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="theme-accent text-xs uppercase tracking-[0.3em]">
                      {pickLanguage(language, {
                        pt: "Sessão",
                        en: "Session",
                      })}
                    </p>
                    <p className="theme-text-muted mt-1 text-sm">
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
