"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useLanguage } from "@/app/language-provider";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { isEnglish } = useLanguage();

  function handleLogout() {
    startTransition(async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (isEnglish ? "Signing out..." : "Saindo...") : isEnglish ? "Sign out" : "Sair"}
    </button>
  );
}
