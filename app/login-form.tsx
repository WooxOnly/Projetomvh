"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ButtonIcon, ButtonLabel } from "@/app/button-icon";
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
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        let data: {
          message?: string;
          redirectTo?: string;
          errors?: FormErrors;
        } = {};

        try {
          data = (await response.json()) as {
            message?: string;
            redirectTo?: string;
            errors?: FormErrors;
          };
        } catch {
          data = {};
        }

        if (!response.ok) {
          setErrors(data.errors ?? {});
          setMessage(
            data.message ??
              (isEnglish
                ? "Unable to sign in right now. Please try again in a moment."
                : "Nao foi possivel entrar agora. Tente novamente em instantes."),
          );
          return;
        }

        router.push(data.redirectTo ?? "/dashboard");
        router.refresh();
      } catch {
        setMessage(
          isEnglish
            ? "Unable to sign in right now. Please try again in a moment."
            : "Nao foi possivel entrar agora. Tente novamente em instantes.",
        );
      }
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
            className="rounded-xl p-2 text-slate-300 transition hover:bg-white/8 hover:text-white"
            aria-label={
              showPassword
                ? isEnglish
                  ? "Hide password"
                  : "Ocultar senha"
                : isEnglish
                  ? "Show password"
                  : "Mostrar senha"
            }
            title={
              showPassword
                ? isEnglish
                  ? "Hide password"
                  : "Ocultar senha"
                : isEnglish
                  ? "Show password"
                  : "Mostrar senha"
            }
          >
            <ButtonIcon name={showPassword ? "hide" : "show"} />
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
        <ButtonLabel icon="login">
          {pending ? (isEnglish ? "Signing in..." : "Entrando...") : isEnglish ? "Sign in" : "Entrar"}
        </ButtonLabel>
      </button>
    </form>
  );
}
