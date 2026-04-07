"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useLanguage } from "@/app/language-provider";

type FormErrors = {
  email?: string;
  password?: string;
};

export function LoginForm() {
  const router = useRouter();
  const { isEnglish } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setErrors({});
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as {
        message?: string;
        redirectTo?: string;
        errors?: FormErrors;
      };

      if (!response.ok) {
        setErrors(data.errors ?? {});
        setMessage(
          data.message ??
            (isEnglish
              ? "Unable to sign in. Check your email, password, and special characters."
              : "Não foi possível entrar. Confira e-mail, senha e caracteres especiais."),
        );
        return;
      }

      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-5"
      method="post"
      action="/api/login"
      onSubmit={handleSubmit}
    >
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">
          {isEnglish ? "Email" : "E-mail"}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder={isEnglish ? "your@email.com" : "seuemail@exemplo.com"}
          autoComplete="email"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
        />
        {errors.email ? <p className="mt-2 text-sm text-rose-300">{errors.email}</p> : null}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
          {isEnglish ? "Password" : "Senha"}
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 pr-2 transition focus-within:border-cyan-300">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder={isEnglish ? "Enter your password" : "Digite sua senha"}
            autoComplete="current-password"
            className="w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-white outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="rounded-xl px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-300 transition hover:bg-white/8 hover:text-white"
          >
            {showPassword ? (isEnglish ? "Hide" : "Ocultar") : isEnglish ? "Show" : "Mostrar"}
          </button>
        </div>
        {errors.password ? (
          <p className="mt-2 text-sm text-rose-300">{errors.password}</p>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-xl border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? (isEnglish ? "Signing in..." : "Entrando...") : isEnglish ? "Sign in" : "Entrar"}
      </button>
    </form>
  );
}
