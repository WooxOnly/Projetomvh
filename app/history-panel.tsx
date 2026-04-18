"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";

type HistoryPanelProps = {
  data: {
    activeUpload: {
      id: string;
      sequenceNumber: number | null;
      fileName: string;
    } | null;
    uploadHistory: Array<{
      id: string;
      sequenceNumber: number | null;
      fileName: string;
      operationDate: Date | string;
      createdAt: Date | string;
      totalCheckins: number;
      totalUniqueCondominiums: number;
      totalUniqueProperties: number;
      totalUniquePMs: number;
    }>;
  };
  filters: {
    startDate: string;
    endDate: string;
  };
};

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="theme-metric-pill rounded-full px-3 py-1 text-xs">
      {label}: <span className="theme-heading font-medium">{value}</span>
    </span>
  );
}

function formatUploadLabel(upload: { sequenceNumber: number | null; fileName: string }) {
  const prefix = upload.sequenceNumber != null ? `#${upload.sequenceNumber} ` : "";
  return `${prefix}${upload.fileName}`;
}

export function HistoryPanel({ data, filters }: HistoryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isEnglish } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(filters);

  const locale = isEnglish ? "en-US" : "pt-BR";

  useEffect(() => {
    setDateFilter(filters);
  }, [filters]);

  function formatDateOnly(value: Date | string) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }

  function formatDateTime(value: Date | string) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function refreshWithMessage(nextMessage: string) {
    setMessage(nextMessage);
    setError("");
    router.refresh();
  }

  function handleLoadHistory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("startDate", dateFilter.startDate);
    params.set("endDate", dateFilter.endDate);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleActivate(uploadId: string) {
    startTransition(async () => {
      setPendingId(uploadId);
      setMessage("");
      setError("");

      try {
        const response = await fetch("/api/uploads/active", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uploadId }),
        });
        const payload = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (isEnglish
                ? "Could not update the active upload."
                : "Não foi possível atualizar o upload ativo."),
          );
        }

        refreshWithMessage(
          payload.message ??
            (isEnglish
              ? "Active upload updated successfully."
              : "Upload ativo atualizado com sucesso."),
        );
      } catch (activationError) {
        setError(
          activationError instanceof Error
            ? activationError.message
            : isEnglish
              ? "Could not update the active upload."
              : "Não foi possível atualizar o upload ativo.",
        );
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleClearActiveUpload() {
    startTransition(async () => {
      setPendingId("clear");
      setMessage("");
      setError("");

      try {
        const response = await fetch("/api/uploads/active", {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (isEnglish
                ? "Could not clear the active upload."
                : "Não foi possível limpar o upload ativo."),
          );
        }

        refreshWithMessage(
          payload.message ??
            (isEnglish ? "No active upload in the system." : "Nenhum upload ativo no sistema."),
        );
      } catch (clearError) {
        setError(
          clearError instanceof Error
            ? clearError.message
            : isEnglish
              ? "Could not clear the active upload."
              : "Não foi possível limpar o upload ativo.",
        );
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="theme-panel rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="theme-accent text-xs uppercase tracking-[0.35em]">
              {isEnglish ? "History" : "Histórico"}
            </p>
            <h3 className="theme-heading mt-2 text-lg font-semibold sm:text-xl">
              {isEnglish ? "Processed uploads" : "Uploads processados"}
            </h3>
            <p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">
              {isEnglish
                ? "Choose which import should stay active in the system, or leave the system with no active base loaded."
                : "Escolha qual importação deve ficar ativa no sistema ou deixe tudo sem base carregada."}
            </p>
          </div>

          <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:flex-wrap">
            <div className="theme-panel-soft content-safe rounded-2xl px-4 py-3 text-sm sm:min-w-64">
              <span className="theme-text-muted">
                {isEnglish ? "Active base" : "Base ativa"}:{" "}
              </span>
              <span className="theme-heading font-medium">
                {data.activeUpload
                  ? formatUploadLabel(data.activeUpload)
                  : isEnglish
                    ? "None"
                    : "Nenhuma"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearActiveUpload}
              disabled={pending}
              className="theme-secondary-button min-h-11 rounded-2xl px-4 py-3 text-sm"
            >
              <ButtonLabel icon="clear">
                {pendingId === "clear"
                  ? isEnglish
                    ? "Clearing..."
                    : "Limpando..."
                  : isEnglish
                    ? "Clear active base"
                    : "Deixar sem ativo"}
              </ButtonLabel>
            </button>
          </div>
        </div>

        <div className="theme-panel-soft mt-4 rounded-[1.25rem] px-4 py-4">
          <p className="theme-accent text-xs uppercase tracking-[0.28em]">
            {isEnglish ? "Date filter" : "Filtro por período"}
          </p>
          <p className="theme-text-muted mt-2 text-sm">
            {isEnglish ? (
              <>
                The history opens with the last 7 days. If you want another range, adjust the dates
                and click <span className="theme-heading font-medium">Load</span>.
              </>
            ) : (
              <>
                O histórico abre com os últimos 7 dias. Se quiser outro intervalo, ajuste as datas
                e clique em <span className="theme-heading font-medium">Carregar</span>.
              </>
            )}
          </p>

          <form
            className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={handleLoadHistory}
          >
            <label className="block">
              <span className="theme-heading mb-2 block text-sm font-medium">
                {isEnglish ? "Start date" : "Data inicial"}
              </span>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(event) =>
                  setDateFilter((current) => ({ ...current, startDate: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
              />
            </label>
            <label className="block">
              <span className="theme-heading mb-2 block text-sm font-medium">
                {isEnglish ? "End date" : "Data final"}
              </span>
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(event) =>
                  setDateFilter((current) => ({ ...current, endDate: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="theme-primary-button min-h-11 w-full rounded-2xl px-4 py-3 text-sm font-semibold md:w-auto"
              >
                <ButtonLabel icon="load">{isEnglish ? "Load" : "Carregar"}</ButtonLabel>
              </button>
            </div>
          </form>
        </div>

        {message ? (
          <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </section>

      {data.uploadHistory.length > 0 ? (
        <section className="space-y-3">
          {data.uploadHistory.map((upload) => {
            const isActive = data.activeUpload?.id === upload.id;

            return (
              <article
                key={upload.id}
                className={`content-safe rounded-[1.5rem] border px-4 py-4 sm:px-5 ${
                  isActive ? "theme-badge" : "theme-panel"
                }`}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="theme-heading truncate text-lg font-semibold">
                        {formatUploadLabel(upload)}
                      </h4>
                      {isActive ? (
                        <span className="theme-badge rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
                          {isEnglish ? "Active in system" : "Ativo no sistema"}
                        </span>
                      ) : null}
                    </div>
                    <p className="theme-text-soft mt-1 text-sm">
                      {isEnglish ? "Operation" : "Operação"}: {formatDateOnly(upload.operationDate)} |{" "}
                      {isEnglish ? "Processed at" : "Processado em"} {formatDateTime(upload.createdAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleActivate(upload.id)}
                    disabled={pending && pendingId === upload.id}
                    className={`min-h-11 rounded-2xl px-4 py-2.5 text-sm font-medium ${
                      isActive ? "theme-badge" : "theme-secondary-button"
                    }`}
                  >
                    <ButtonLabel icon="activate">
                      {pendingId === upload.id
                        ? isEnglish
                          ? "Activating..."
                          : "Ativando..."
                        : isActive
                          ? isEnglish
                            ? "Already active"
                            : "Já ativo"
                          : isEnglish
                            ? "Activate in system"
                            : "Ativar no sistema"}
                    </ButtonLabel>
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <MetricPill
                    label={isEnglish ? "Check-ins" : "Check-ins"}
                    value={upload.totalCheckins}
                  />
                  <MetricPill
                    label={isEnglish ? "Resorts" : "Condomínios"}
                    value={upload.totalUniqueCondominiums}
                  />
                  <MetricPill
                    label={isEnglish ? "Homes" : "Casas"}
                    value={upload.totalUniqueProperties}
                  />
                  <MetricPill
                    label={isEnglish ? "PMs" : "PMs"}
                    value={upload.totalUniquePMs}
                  />
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="theme-panel rounded-[1.5rem] p-6 text-sm theme-text-muted">
          {isEnglish
            ? "No processed uploads were found for this period."
            : "Nenhum upload processado foi encontrado nesse período."}
        </section>
      )}
    </div>
  );
}
