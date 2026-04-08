"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLanguage } from "@/app/language-provider";

export function DashboardSectionNav() {
  const pathname = usePathname();
  const { isEnglish } = useLanguage();

  const sections = [
    { href: "/dashboard", label: isEnglish ? "Home" : "Início" },
    { href: "/dashboard/cadastros", label: isEnglish ? "Records" : "Cadastros" },
    { href: "/dashboard/history", label: isEnglish ? "History" : "Histórico" },
    { href: "/dashboard/process", label: isEnglish ? "Daily Flow" : "Fluxo do Dia" },
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
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30"
                : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
