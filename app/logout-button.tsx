"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ButtonLabel } from "@/app/button-icon";
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
      className="theme-secondary-button rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      <ButtonLabel icon="logout">
        {pending ? (isEnglish ? "Signing out..." : "Saindo...") : isEnglish ? "Sign out" : "Sair"}
      </ButtonLabel>
    </button>
  );
}
