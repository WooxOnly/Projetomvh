"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {label}: <span className="font-medium text-white">{value}</span>
    </span>
  );
}

function formatUploadLabel(
  upload: { sequenceNumber: number | null; fileName: string },
) {
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
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
              {isEnglish ? "History" : "Histórico"}
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white sm:text-xl">
              {isEnglish ? "Processed uploads" : "Uploads processados"}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {isEnglish
                ? "Choose which import should stay active in the system, or leave the system with no active base loaded."
                : "Escolha qual importação deve ficar ativa no sistema ou deixe tudo sem base carregada."}
            </p>
          </div>

          <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:flex-wrap">
              <div className="content-safe rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 sm:min-w-64">
                {isEnglish ? "Active base" : "Base ativa"}:{" "}
                <span className="font-medium text-white">
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
              className="min-h-11 rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-100"
            >
              {pendingId === "clear"
                ? isEnglish
                  ? "Clearing..."
                  : "Limpando..."
                : isEnglish
                  ? "Clear active base"
                  : "Deixar sem ativo"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[1.25rem] border border-cyan-300/15 bg-cyan-300/5 p-4">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">
            {isEnglish ? "Date filter" : "Filtro por período"}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {isEnglish ? (
              <>
                The history opens with the last 7 days. If you want another range, adjust the dates
                and click <span className="font-medium text-white">Load</span>.
              </>
            ) : (
              <>
                O histórico abre com os últimos 7 dias. Se quiser outro intervalo, ajuste as datas
                e clique em <span className="font-medium text-white">Carregar</span>.
              </>
            )}
          </p>

          <form
            className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={handleLoadHistory}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-100">
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
              <span className="mb-2 block text-sm font-medium text-slate-100">
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
                className="min-h-11 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 md:w-auto"
              >
                {isEnglish ? "Load" : "Carregar"}
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
                  isActive
                    ? "border-cyan-300/30 bg-cyan-300/8"
                    : "border-white/10 bg-slate-950/40"
                }`}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="truncate text-lg font-semibold text-white">
                        {formatUploadLabel(upload)}
                      </h4>
                      {isActive ? (
                        <span className="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-cyan-200">
                          {isEnglish ? "Active in system" : "Ativo no sistema"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {isEnglish ? "Operation" : "Operação"}: {formatDateOnly(upload.operationDate)} |{" "}
                      {isEnglish ? "Processed at" : "Processado em"} {formatDateTime(upload.createdAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleActivate(upload.id)}
                    disabled={pending && pendingId === upload.id}
                    className={`min-h-11 rounded-2xl px-4 py-2.5 text-sm font-medium ${
                      isActive
                        ? "border border-cyan-300/30 bg-cyan-300/15 text-cyan-100"
                        : "border border-white/10 bg-white/5 text-slate-100"
                    }`}
                  >
                    {pending && pendingId === upload.id
                      ? isEnglish
                        ? "Updating..."
                        : "Atualizando..."
                      : isActive
                        ? isEnglish
                          ? "Active upload"
                          : "Upload ativo"
                        : isEnglish
                          ? "Set as active"
                          : "Tornar ativo"}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <MetricPill label="Check-ins" value={upload.totalCheckins} />
                  <MetricPill
                    label={isEnglish ? "Resorts" : "Condomínios"}
                    value={upload.totalUniqueCondominiums}
                  />
                  <MetricPill
                    label={isEnglish ? "Houses" : "Casas"}
                    value={upload.totalUniqueProperties}
                  />
                  <MetricPill
                    label={isEnglish ? "Property Managers" : "Gerentes de Propriedades"}
                    value={upload.totalUniquePMs}
                  />
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="rounded-[1.5rem] border border-dashed border-white/15 bg-slate-950/30 p-6 text-sm text-slate-300">
          {isEnglish
            ? "No upload has been processed yet. As soon as a file is imported, it will appear here for consultation and future activation."
            : "Nenhum upload foi processado ainda. Assim que um arquivo for importado, ele aparecerá aqui para consulta e ativação futura."}
        </section>
      )}
    </div>
  );
}
