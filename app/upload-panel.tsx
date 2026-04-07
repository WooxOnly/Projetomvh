"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useLanguage } from "@/app/language-provider";

type OfficeSummary = {
  id: string;
  name: string;
};

type UploadSummary = {
  id: string;
  sequenceNumber: number | null;
  fileName: string;
  operationDate: Date | string;
  createdAt: Date | string;
  totalRows: number;
  totalCheckins: number;
  totalUniqueCondominiums: number;
  totalUniqueProperties: number;
  totalUniquePMs: number;
};

type UploadResponse = {
  ok?: boolean;
  message?: string;
  missingBedrooms?: string[];
  upload?: UploadSummary;
  newPropertyManagersWithoutOffice?: Array<{ id: string; name: string }>;
  newCondominiumsWithoutOffice?: Array<{ id: string; name: string }>;
  requiresReview?: boolean;
  suspiciousRowCount?: number;
  suspiciousRows?: Array<{
    sourceRowNumber: number;
    summary: string;
    rawValues: string[];
  }>;
};

type UploadPanelProps = {
  offices: OfficeSummary[];
  onReviewMissingBedrooms?: () => void;
  onOpenDetailsTab?: () => void;
};

function formatUploadLabel(upload: { sequenceNumber: number | null; fileName: string }) {
  const prefix = upload.sequenceNumber != null ? `#${upload.sequenceNumber} ` : "";
  return `${prefix}${upload.fileName}`;
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function UploadPanel({
  offices,
  onReviewMissingBedrooms,
  onOpenDetailsTab,
}: UploadPanelProps) {
  const router = useRouter();
  const { isEnglish } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [assigningOffices, startAssigningOffices] = useTransition();
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [missingBedrooms, setMissingBedrooms] = useState<string[]>([]);
  const [reviewState, setReviewState] = useState<{
    operationDate: string;
    file: File;
    suspiciousRowCount: number;
    suspiciousRows: Array<{
      sourceRowNumber: number;
      summary: string;
      rawValues: string[];
    }>;
  } | null>(null);
  const [officeAssignmentState, setOfficeAssignmentState] = useState<{
    propertyManagers: Array<{ id: string; name: string }>;
    condominiums: Array<{ id: string; name: string }>;
    values: Record<string, string>;
  } | null>(null);

  async function submitUpload(formData: FormData) {
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    return {
      response,
      data: (await response.json()) as UploadResponse,
    };
  }

  async function patchJson(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      throw new Error(
        data.message ??
          (isEnglish ? "Could not save the office." : "Não foi possível salvar o escritório."),
      );
    }
  }

  function openOfficeAssignmentModal(data: UploadResponse) {
    const propertyManagers = data.newPropertyManagersWithoutOffice ?? [];
    const condominiums = data.newCondominiumsWithoutOffice ?? [];

    if (propertyManagers.length === 0 && condominiums.length === 0) {
      setOfficeAssignmentState(null);
      return;
    }

    const values: Record<string, string> = {};

    for (const item of propertyManagers) {
      values[`pm:${item.id}`] = "";
    }

    for (const item of condominiums) {
      values[`condominium:${item.id}`] = "";
    }

    setOfficeAssignmentState({
      propertyManagers,
      condominiums,
      values,
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setMessage("");
    setError("");
    setMissingBedrooms([]);
    setReviewState(null);

    startTransition(async () => {
      const operationDate = String(formData.get("operationDate") ?? "");
      const file = formData.get("file");
      const { response, data } = await submitUpload(formData);

      if (response.status === 409 && data.requiresReview && file instanceof File) {
        setReviewState({
          operationDate,
          file,
          suspiciousRowCount: data.suspiciousRowCount ?? data.suspiciousRows?.length ?? 0,
          suspiciousRows: data.suspiciousRows ?? [],
        });
        return;
      }

      if (!response.ok) {
        setError(
          data.message ??
            (isEnglish
              ? "Could not process the upload."
              : "Não foi possível processar o upload."),
        );
        return;
      }

      setSummary(data.upload ?? null);
      setMessage(
        data.message ??
          (isEnglish ? "Upload processed successfully." : "Upload processado com sucesso."),
      );
      setMissingBedrooms(data.missingBedrooms ?? []);
      setReviewState(null);
      openOfficeAssignmentModal(data);
      form.reset();
      router.refresh();
    });
  }

  function handleConfirmImport() {
    if (!reviewState) {
      return;
    }

    setMessage("");
    setError("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("operationDate", reviewState.operationDate);
      formData.set("file", reviewState.file);
      formData.set("allowSuspiciousRows", "true");

      const { response, data } = await submitUpload(formData);

      if (!response.ok) {
        setError(
          data.message ??
            (isEnglish
              ? "Could not process the upload."
              : "Não foi possível processar o upload."),
        );
        return;
      }

      setSummary(data.upload ?? null);
      setMessage(
        data.message ??
          (isEnglish ? "Upload processed successfully." : "Upload processado com sucesso."),
      );
      setMissingBedrooms(data.missingBedrooms ?? []);
      setReviewState(null);
      openOfficeAssignmentModal(data);
      router.refresh();
    });
  }

  function updateOfficeAssignmentValue(key: string, officeId: string) {
    setOfficeAssignmentState((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              [key]: officeId,
            },
          }
        : current,
    );
  }

  const pendingAssignmentsCount = officeAssignmentState
    ? officeAssignmentState.propertyManagers.length + officeAssignmentState.condominiums.length
    : 0;
  const canSaveOfficeAssignments =
    officeAssignmentState != null &&
    Object.values(officeAssignmentState.values).every((value) => value.trim().length > 0);

  function handleSaveOfficeAssignments() {
    if (!officeAssignmentState || !canSaveOfficeAssignments) {
      return;
    }

    startAssigningOffices(async () => {
      try {
        await Promise.all([
          ...officeAssignmentState.propertyManagers.map((item) =>
            patchJson(`/api/property-managers/${item.id}`, {
              name: item.name,
              officeId: officeAssignmentState.values[`pm:${item.id}`],
            }),
          ),
          ...officeAssignmentState.condominiums.map((item) =>
            patchJson(`/api/condominiums/${item.id}`, {
              nameOriginal: item.name,
              officeId: officeAssignmentState.values[`condominium:${item.id}`],
            }),
          ),
        ]);

        setOfficeAssignmentState(null);
        setMessage(
          isEnglish
            ? "Offices saved for the new records."
            : "Escritórios salvos para os novos cadastros.",
        );
        setError("");
        router.refresh();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : isEnglish
              ? "Could not save the office assignments."
              : "Não foi possível salvar os escritórios.",
        );
      }
    });
  }

  return (
    <>
      {pending ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/95 p-6 text-center shadow-2xl shadow-cyan-950/30">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
            <h3 className="mt-5 text-lg font-semibold text-white">
              {isEnglish ? "Processing upload" : "Processando upload"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {isEnglish
                ? "We are reading the spreadsheet, validating the rows, and updating the operational base."
                : "Estamos lendo a planilha, validando as linhas e atualizando a base operacional."}
            </p>
          </div>
        </div>
      ) : null}
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">Upload</p>
        <h2 className="mt-4 text-2xl font-semibold text-white">
          {isEnglish ? "Import operational base" : "Importar base operacional"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          {isEnglish
            ? "Upload a CSV or XLSX file with check-ins, resorts, homes, and property managers. The system registers the upload, enriches the database, and activates this file for the rest of the flow."
            : "Envie um arquivo CSV ou XLSX com check-ins, condomínios, casas e gerentes de propriedades. O sistema registra o upload, enriquece a base e ativa esse arquivo para o restante do fluxo."}
        </p>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                {isEnglish ? "Operation date" : "Data da operação"}
              </span>
              <input
                type="date"
                name="operationDate"
                defaultValue={todayInputValue()}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                {isEnglish ? "CSV or XLSX file" : "Arquivo CSV ou XLSX"}
              </span>
              <input
                type="file"
                name="file"
                accept=".csv,.xlsx,.xls"
                className="w-full rounded-2xl border border-dashed border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending
                ? isEnglish
                  ? "Processing..."
                  : "Processando..."
                : isEnglish
                  ? "Process upload"
                  : "Processar upload"}
            </button>
          </div>
        </form>

        {message ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            <p>{message}</p>
            {summary ? (
              <p className="mt-2 text-emerald-50/90">
                {isEnglish ? "Active file" : "Arquivo ativo"}:{" "}
                <span className="font-medium text-white">{formatUploadLabel(summary)}</span>
              </p>
            ) : null}
            {summary && onOpenDetailsTab ? (
              <button
                type="button"
                onClick={onOpenDetailsTab}
                className="mt-3 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950"
              >
                {isEnglish ? "Open details" : "Abrir detalhamento"}
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        {reviewState ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100">
            <p className="font-medium">
              {isEnglish
                ? `We found ${reviewState.suspiciousRowCount} ${reviewState.suspiciousRowCount === 1 ? "row that needs review" : "rows that need review"}.`
                : `Encontramos ${reviewState.suspiciousRowCount} ${reviewState.suspiciousRowCount === 1 ? "linha que precisa de revisão" : "linhas que precisam de revisão"}.`}
            </p>
            <p className="mt-2 text-amber-50/90">
              {isEnglish
                ? "The spreadsheet has incomplete or unusual information. This may indicate a fill error, a loose row, or partial data. Do you want to import it anyway?"
                : "A planilha tem informações incompletas ou fora do padrão. Isso pode indicar erro de preenchimento, linha solta ou dado parcial. Deseja importar mesmo assim?"}
            </p>
            <div className="mt-4 space-y-2">
              {reviewState.suspiciousRows.map((row) => (
                <div
                  key={row.sourceRowNumber}
                  className="rounded-2xl border border-amber-100/15 bg-slate-950/30 p-3"
                >
                  <p className="font-medium text-amber-50">
                    {isEnglish ? "Row" : "Linha"} {row.sourceRowNumber}
                  </p>
                  <p className="mt-1 text-amber-50/90">
                    {row.summary ||
                      (isEnglish ? "Row with incomplete data" : "Linha com dados incompletos")}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={pending}
                className="rounded-2xl bg-amber-200 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100 disabled:opacity-70"
              >
                {isEnglish ? "Import anyway" : "Importar mesmo assim"}
              </button>
              <button
                type="button"
                onClick={() => setReviewState(null)}
                className="rounded-2xl border border-amber-200/30 bg-transparent px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/10"
              >
                {isEnglish ? "Cancel and review file" : "Cancelar e revisar planilha"}
              </button>
            </div>
          </div>
        ) : null}

        {missingBedrooms.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100">
            <p className="font-medium">
              {isEnglish
                ? "Some homes still do not have a bedroom count."
                : "Algumas casas ainda estão sem quantidade de quartos."}
            </p>
            <p className="mt-2 text-amber-50/90">
              {isEnglish
                ? `We identified ${missingBedrooms.length} ${missingBedrooms.length === 1 ? "home" : "homes"} without this information. The rest of the flow can continue normally.`
                : `Identificamos ${missingBedrooms.length} ${missingBedrooms.length === 1 ? "casa sem essa informação" : "casas sem essa informação"}. O restante do fluxo pode continuar normalmente.`}
            </p>
            {onReviewMissingBedrooms ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onReviewMissingBedrooms}
                  className="rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/20"
                >
                  {isEnglish ? "Review on Homes page" : "Revisar na página Casas"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {officeAssignmentState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[1.75rem] border border-cyan-300/20 bg-slate-950 p-6 shadow-2xl shadow-cyan-950/30">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
              {isEnglish ? "Office assignment" : "Vincular escritório"}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-white">
              {isEnglish
                ? "Assign the office for the new records"
                : "Defina o escritório dos novos cadastros"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {isEnglish
                ? `We found ${pendingAssignmentsCount} new record(s) without an office. Select the office for each new property manager and resort created from this import.`
                : `Encontramos ${pendingAssignmentsCount} novo(s) cadastro(s) sem escritório. Selecione o escritório de cada gerente e condomínio criados nesta importação.`}
            </p>

            <div className="mt-5 max-h-[60vh] space-y-5 overflow-y-auto pr-2">
              {officeAssignmentState.propertyManagers.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-white">
                    {isEnglish ? "New property managers" : "Novos gerentes de propriedades"}
                  </p>
                  {officeAssignmentState.propertyManagers.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_280px]"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {isEnglish
                            ? "Property manager created from import"
                            : "Gerente criado pela importação"}
                        </p>
                      </div>
                      <select
                        value={officeAssignmentState.values[`pm:${item.id}`] ?? ""}
                        onChange={(event) =>
                          updateOfficeAssignmentValue(`pm:${item.id}`, event.target.value)
                        }
                        className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                      >
                        <option value="">
                          {isEnglish ? "Select the office" : "Selecione o escritório"}
                        </option>
                        {offices.map((office) => (
                          <option key={office.id} value={office.id}>
                            {office.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}

              {officeAssignmentState.condominiums.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-white">
                    {isEnglish ? "New resorts" : "Novos condomínios"}
                  </p>
                  {officeAssignmentState.condominiums.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_280px]"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {isEnglish
                            ? "Resort created from import"
                            : "Condomínio criado pela importação"}
                        </p>
                      </div>
                      <select
                        value={officeAssignmentState.values[`condominium:${item.id}`] ?? ""}
                        onChange={(event) =>
                          updateOfficeAssignmentValue(
                            `condominium:${item.id}`,
                            event.target.value,
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                      >
                        <option value="">
                          {isEnglish ? "Select the office" : "Selecione o escritório"}
                        </option>
                        {offices.map((office) => (
                          <option key={office.id} value={office.id}>
                            {office.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setOfficeAssignmentState(null)}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200"
              >
                {isEnglish ? "Later" : "Depois"}
              </button>
              <button
                type="button"
                disabled={!canSaveOfficeAssignments || assigningOffices}
                onClick={handleSaveOfficeAssignments}
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {assigningOffices
                  ? isEnglish
                    ? "Saving..."
                    : "Salvando..."
                  : isEnglish
                    ? "Save offices"
                    : "Salvar escritórios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
