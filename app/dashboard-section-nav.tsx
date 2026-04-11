"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";

export function DashboardSectionNav() {
  const pathname = usePathname();
  const { isEnglish } = useLanguage();

  const sections = [
    { href: "/dashboard", label: isEnglish ? "Home" : "Início", icon: "home" as const },
    {
      href: "/dashboard/cadastros",
      label: isEnglish ? "Records" : "Cadastros",
      icon: "office" as const,
    },
    {
      href: "/dashboard/history",
      label: isEnglish ? "History" : "Histórico",
      icon: "history" as const,
    },
    {
      href: "/dashboard/process",
      label: isEnglish ? "Daily Flow" : "Fluxo do Dia",
      icon: "route" as const,
    },
  ];

  return (
    <nav className="mobile-tab-row md:flex md:flex-wrap md:gap-3 md:overflow-visible md:pb-0">
      {sections.map((section) => {
        const isActive =
          section.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(section.href);

        return (
          <Link
            key={section.href}
            href={section.href}
            className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2.5 text-sm font-medium transition sm:px-[1.15rem] ${
              isActive
                ? "border-cyan-200/50 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30"
                : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-300/35 hover:bg-white/10"
            }`}
          >
            <ButtonLabel icon={section.icon}>{section.label}</ButtonLabel>
          </Link>
        );
      })}
    </nav>
  );
}
