"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { ButtonLabel } from "@/app/button-icon";
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
  totalOwnerCheckins: number;
  totalBlockedCheckins: number;
  totalCancelledCheckins: number;
  totalUniqueCondominiums: number;
  totalUniqueProperties: number;
  totalUniquePMs: number;
};

type CheckinClassification = "CHECKIN" | "OWNER" | "BLOCKED" | "CANCELLED";

type UploadReviewData = {
  id: string;
  sequenceNumber: number | null;
  fileName: string;
  operationDate: Date | string;
  createdAt: Date | string;
  totalRows: number;
  totalCheckins: number;
  totalOwnerCheckins: number;
  totalBlockedCheckins: number;
  totalCancelledCheckins: number;
  reviewItems: Array<{
    id: string;
    sourceRowNumber: number | null;
    classification: CheckinClassification;
    integratorName: string | null;
    condominiumName: string | null;
    propertyName: string | null;
    building: string | null;
    address: string | null;
    guestName: string | null;
  }>;
};

type DuplicateUploadCheckin = {
  operationDate: string;
  condominiumName: string;
  propertyName: string;
  address: string;
  sourceRowNumbers: number[];
  totalOccurrences: number;
};

type UploadResponse = {
  ok?: boolean;
  message?: string;
  missingBedrooms?: string[];
  duplicateCheckins?: DuplicateUploadCheckin[];
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
  activeUploadReview: UploadReviewData | null;
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

function readPersistedUploadFeedback() {
  if (typeof window === "undefined") {
    return {
      message: "",
      summary: null as UploadSummary | null,
      missingBedrooms: [] as string[],
      duplicateCheckins: [] as DuplicateUploadCheckin[],
    };
  }

  const storedFeedback = window.sessionStorage.getItem("upload-panel-feedback");
  if (!storedFeedback) {
    return {
      message: "",
      summary: null as UploadSummary | null,
      missingBedrooms: [] as string[],
      duplicateCheckins: [] as DuplicateUploadCheckin[],
    };
  }

  window.sessionStorage.removeItem("upload-panel-feedback");

  try {
    const parsed = JSON.parse(storedFeedback) as {
      message?: string;
      summary?: UploadSummary | null;
      missingBedrooms?: string[];
      duplicateCheckins?: DuplicateUploadCheckin[];
    };

    return {
      message: parsed.message ?? "",
      summary: parsed.summary ?? null,
      missingBedrooms: parsed.missingBedrooms ?? [],
      duplicateCheckins: parsed.duplicateCheckins ?? [],
    };
  } catch {
    return {
      message: "",
      summary: null as UploadSummary | null,
      missingBedrooms: [] as string[],
      duplicateCheckins: [] as DuplicateUploadCheckin[],
    };
  }
}

export function UploadPanel({
  offices,
  activeUploadReview,
  onReviewMissingBedrooms,
  onOpenDetailsTab,
}: UploadPanelProps) {
  const router = useRouter();
  const { isEnglish } = useLanguage();
  const [initialFeedback] = useState(readPersistedUploadFeedback);
  const [pending, startTransition] = useTransition();
  const [assigningOffices, startAssigningOffices] = useTransition();
  const [summary, setSummary] = useState<UploadSummary | null>(initialFeedback.summary);
  const [message, setMessage] = useState(initialFeedback.message);
  const [error, setError] = useState("");
  const [missingBedrooms, setMissingBedrooms] = useState<string[]>(initialFeedback.missingBedrooms);
  const [duplicateCheckins, setDuplicateCheckins] = useState<DuplicateUploadCheckin[]>(
    initialFeedback.duplicateCheckins,
  );
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
  const [reviewData, setReviewData] = useState<UploadReviewData | null>(activeUploadReview);
  const [classificationPendingId, setClassificationPendingId] = useState<string | null>(null);
  const [isReviewExpanded, setIsReviewExpanded] = useState(false);

  useEffect(() => {
    setReviewData(activeUploadReview);
    if (activeUploadReview) {
      setSummary({
        id: activeUploadReview.id,
        sequenceNumber: activeUploadReview.sequenceNumber,
        fileName: activeUploadReview.fileName,
        operationDate: activeUploadReview.operationDate,
        createdAt: activeUploadReview.createdAt,
        totalRows: activeUploadReview.totalRows,
        totalCheckins: activeUploadReview.totalCheckins,
        totalOwnerCheckins: activeUploadReview.totalOwnerCheckins,
        totalBlockedCheckins: activeUploadReview.totalBlockedCheckins,
        totalCancelledCheckins: activeUploadReview.totalCancelledCheckins,
        totalUniqueCondominiums: 0,
        totalUniqueProperties: 0,
        totalUniquePMs: 0,
      });
    }
  }, [activeUploadReview]);

  useEffect(() => {
    setIsReviewExpanded(false);
  }, [reviewData?.id]);

  function persistUploadFeedback(next: {
    message: string;
    summary: UploadSummary | null;
    missingBedrooms: string[];
    duplicateCheckins: DuplicateUploadCheckin[];
  }) {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem("upload-panel-feedback", JSON.stringify(next));
  }

  function renderViewportOverlay(content: React.ReactNode) {
    if (typeof document === "undefined") {
      return null;
    }

    return createPortal(content, document.body);
  }

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

  async function patchClassification(checkinId: string, classification: CheckinClassification) {
    const response = await fetch(`/api/checkins/${checkinId}/classification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      upload?: UploadSummary;
      uploadReview?: UploadReviewData;
    };

    if (!response.ok) {
      throw new Error(
        data.message ??
          (isEnglish
            ? "Could not update the classification."
            : "Nao foi possivel atualizar a classificacao."),
      );
    }

    return data;
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
    setDuplicateCheckins([]);
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

      const nextSummary = data.upload ?? null;
      const nextMessage =
        data.message ??
        (isEnglish ? "Upload processed successfully." : "Upload processado com sucesso.");
      const nextMissingBedrooms = data.missingBedrooms ?? [];
      const nextDuplicateCheckins = data.duplicateCheckins ?? [];

      setSummary(nextSummary);
      setMessage(nextMessage);
      setMissingBedrooms(nextMissingBedrooms);
      setDuplicateCheckins(nextDuplicateCheckins);
      setReviewState(null);
      openOfficeAssignmentModal(data);
      form.reset();
      persistUploadFeedback({
        message: nextMessage,
        summary: nextSummary,
        missingBedrooms: nextMissingBedrooms,
        duplicateCheckins: nextDuplicateCheckins,
      });
      router.refresh();
    });
  }

  function handleConfirmImport() {
    if (!reviewState) {
      return;
    }

    setMessage("");
    setError("");
    setDuplicateCheckins([]);

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

      const nextSummary = data.upload ?? null;
      const nextMessage =
        data.message ??
        (isEnglish ? "Upload processed successfully." : "Upload processado com sucesso.");
      const nextMissingBedrooms = data.missingBedrooms ?? [];
      const nextDuplicateCheckins = data.duplicateCheckins ?? [];

      setSummary(nextSummary);
      setMessage(nextMessage);
      setMissingBedrooms(nextMissingBedrooms);
      setDuplicateCheckins(nextDuplicateCheckins);
      setReviewState(null);
      openOfficeAssignmentModal(data);
      persistUploadFeedback({
        message: nextMessage,
        summary: nextSummary,
        missingBedrooms: nextMissingBedrooms,
        duplicateCheckins: nextDuplicateCheckins,
      });
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

  function getClassificationLabel(classification: CheckinClassification) {
    if (classification === "OWNER") {
      return "CHECK INS";
    }

    if (classification === "CANCELLED") {
      return "Cancelled";
    }

    if (classification === "BLOCKED") {
      return "BLACKED OUT";
    }

    return "CHECK INS";
  }

  function getClassificationBadgeClass(classification: CheckinClassification) {
    if (classification === "OWNER") {
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
    }

    if (classification === "CANCELLED") {
      return "border-orange-400/25 bg-orange-400/10 text-orange-100";
    }

    if (classification === "BLOCKED") {
      return "border-rose-400/25 bg-rose-400/10 text-rose-100";
    }

    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }

  async function handleClassificationChange(checkinId: string, classification: CheckinClassification) {
    setClassificationPendingId(checkinId);
    setError("");

    try {
      const data = await patchClassification(checkinId, classification);
      setSummary(data.upload ?? null);
      setReviewData(data.uploadReview ?? null);
      setMessage(
        isEnglish
          ? "Classification updated successfully."
          : "Classificacao atualizada com sucesso.",
      );
      router.refresh();
    } catch (classificationError) {
      setError(
        classificationError instanceof Error
          ? classificationError.message
          : isEnglish
            ? "Could not update the classification."
            : "Nao foi possivel atualizar a classificacao.",
      );
    } finally {
      setClassificationPendingId(null);
    }
  }

  const reviewSections = reviewData
    ? [
        {
          key: "CHECKIN" as const,
          title: "CHECK INS",
          count: reviewData.totalCheckins + reviewData.totalOwnerCheckins,
          emptyMessage: isEnglish ? "No check-ins in this upload." : "Nenhum check-in neste upload.",
        },
        {
          key: "BLOCKED" as const,
          title: "BLACKED OUT",
          count: reviewData.totalBlockedCheckins,
          emptyMessage: isEnglish ? "No BLACKED OUT lines in this upload." : "Nenhuma linha BLACKED OUT neste upload.",
        },
        {
          key: "CANCELLED" as const,
          title: "Cancelled",
          count: reviewData.totalCancelledCheckins,
          emptyMessage: isEnglish ? "No Cancelled lines in this upload." : "Nenhuma linha Cancelled neste upload.",
        },
      ]
    : [];

  return (
    <>
      {pending
        ? renderViewportOverlay(
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
            </div>,
          )
        : null}
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">Upload</p>
        <h2 className="mt-4 text-xl font-semibold text-white sm:text-2xl">
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
              className="min-h-11 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ButtonLabel icon="upload">
                {pending
                  ? isEnglish
                    ? "Processing..."
                    : "Processando..."
                  : isEnglish
                    ? "Process upload"
                    : "Processar upload"}
              </ButtonLabel>
            </button>
          </div>
        </form>

        {message || summary ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-200">
            {message ? <p className="font-medium text-white">{message}</p> : null}
            {summary ? (
              <p className="mt-2 text-slate-300">
                {isEnglish ? "Active file" : "Arquivo ativo"}:{" "}
                <span className="font-medium text-white">{formatUploadLabel(summary)}</span>
              </p>
            ) : null}
            {summary ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-200">
                  <p className="uppercase tracking-[0.2em] text-slate-400">{isEnglish ? "Imported" : "Importado"}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{summary.totalRows}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-200">
                  <p className="uppercase tracking-[0.2em] text-cyan-300">CHECK INS</p>
                  <p className="mt-1 text-sm font-semibold text-white">{summary.totalCheckins + summary.totalOwnerCheckins}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-200">
                  <p className="uppercase tracking-[0.2em] text-rose-200">BLACKED OUT / CANCELLED</p>
                  <p className="mt-1 text-sm font-semibold text-white">{summary.totalBlockedCheckins + summary.totalCancelledCheckins}</p>
                </div>
              </div>
            ) : null}
            {summary && (onOpenDetailsTab || reviewData) ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {reviewData ? (
                  <button
                    type="button"
                    onClick={() => setIsReviewExpanded((current) => !current)}
                    className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                  >
                    <ButtonLabel icon="details">
                      {isReviewExpanded
                        ? isEnglish
                          ? "Hide imported lines"
                          : "Ocultar linhas importadas"
                        : isEnglish
                          ? "Review imported lines"
                          : "Revisar linhas importadas"}
                    </ButtonLabel>
                  </button>
                ) : null}
                {summary && onOpenDetailsTab ? (
                  <button
                    type="button"
                    onClick={onOpenDetailsTab}
                    className="min-h-11 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950"
                  >
                    <ButtonLabel icon="details">
                      {isEnglish ? "Open details" : "Abrir detalhamento"}
                    </ButtonLabel>
                  </button>
                ) : null}
              </div>
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
                className="min-h-11 rounded-2xl bg-amber-200 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100 disabled:opacity-70"
              >
                <ButtonLabel icon="upload">
                  {isEnglish ? "Import anyway" : "Importar mesmo assim"}
                </ButtonLabel>
              </button>
              <button
                type="button"
                onClick={() => setReviewState(null)}
                className="min-h-11 rounded-2xl border border-amber-200/30 bg-transparent px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/10"
              >
                <ButtonLabel icon="cancel">
                  {isEnglish ? "Cancel and review file" : "Cancelar e revisar planilha"}
                </ButtonLabel>
              </button>
            </div>
          </div>
        ) : null}

        {duplicateCheckins.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/8 p-4 text-sm text-rose-100">
            <p className="font-medium">
              {isEnglish
                ? `We found ${duplicateCheckins.length} possible duplicate ${duplicateCheckins.length === 1 ? "check-in" : "check-ins"} in the imported file.`
                : `Encontramos ${duplicateCheckins.length} poss${duplicateCheckins.length === 1 ? "ível check-in duplicado" : "íveis check-ins duplicados"} no arquivo importado.`}
            </p>
            <p className="mt-2 text-rose-50/90">
              {isEnglish
                ? "The upload was completed, but these rows deserve review in the source spreadsheet."
                : "O upload foi concluído, mas estas linhas merecem revisão na planilha de origem."}
            </p>
            <div className="mt-4 space-y-2">
              {duplicateCheckins.map((item) => (
                <div
                  key={`${item.operationDate}-${item.condominiumName}-${item.propertyName}-${item.address}`}
                  className="rounded-2xl border border-rose-100/15 bg-slate-950/30 p-3"
                >
                  <p className="font-medium text-rose-50">
                    {item.condominiumName || (isEnglish ? "Condominium not informed" : "Condomínio não informado")} |{" "}
                    {item.propertyName || (isEnglish ? "Property not informed" : "Imóvel não informado")}
                  </p>
                  <p className="mt-1 text-rose-50/90">
                    {item.address || (isEnglish ? "Address not informed" : "Endereço não informado")}
                  </p>
                  <p className="mt-1 text-xs text-rose-50/80">
                    {isEnglish ? "Spreadsheet rows" : "Linhas da planilha"}: {item.sourceRowNumbers.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {reviewData && isReviewExpanded ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
              {isEnglish ? "Import review" : "Revisão da importação"}
            </p>
            <h3 className="mt-3 text-lg font-semibold text-white">
              {isEnglish ? "Imported lines" : "Linhas importadas"}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {isEnglish
                ? "Open only the group you want to review. You can move any line between CHECK INS, BLACKED OUT, and Cancelled before running the operation."
                : "Abra apenas o grupo que quiser revisar. Você pode mover qualquer linha entre CHECK INS, BLACKED OUT e Cancelled antes de rodar a operação."}
            </p>

            <div className="mt-5 space-y-4">
              {reviewSections.map((section) => {
                const items = reviewData.reviewItems.filter((item) =>
                  section.key === "CHECKIN"
                    ? item.classification === "CHECKIN" || item.classification === "OWNER"
                    : item.classification === section.key,
                );

                return (
                  <details
                    key={section.key}
                    className="rounded-2xl border border-white/10 bg-slate-950/45 p-4"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{section.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {section.count} {isEnglish ? "line(s)" : "linha(s)"}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getClassificationBadgeClass(section.key)}`}>
                          {getClassificationLabel(section.key)}
                        </span>
                      </div>
                    </summary>

                    {items.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                          >
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getClassificationBadgeClass(item.classification)}`}>
                                    {getClassificationLabel(item.classification)}
                                  </span>
                                  {item.sourceRowNumber != null ? (
                                    <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[11px] text-slate-300">
                                      {isEnglish ? "Row" : "Linha"} {item.sourceRowNumber}
                                    </span>
                                  ) : null}
                                  {item.integratorName ? (
                                    <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[11px] text-slate-300">
                                      Integrator: {item.integratorName}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-3 text-sm font-semibold text-white">
                                  {item.propertyName || (isEnglish ? "Property not informed" : "Imóvel não informado")}
                                </p>
                                <p className="mt-1 text-xs text-slate-300">
                                  {isEnglish ? "Resort" : "Condomínio"}: {item.condominiumName || (isEnglish ? "Not informed" : "Não informado")}
                                </p>
                                <p className="mt-1 text-xs text-slate-300">
                                  {isEnglish ? "Address" : "Endereço"}: {item.address || (isEnglish ? "Not informed" : "Não informado")}
                                  {item.building ? ` | ${isEnglish ? "Building" : "Building"} ${item.building}` : ""}
                                </p>
                                {item.guestName ? (
                                  <p className="mt-1 text-xs text-slate-400">
                                    Guest: {item.guestName}
                                  </p>
                                ) : null}
                              </div>
                              <div className="w-full max-w-xs xl:flex-shrink-0">
                                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {isEnglish ? "Classification" : "Classificação"}
                                  <select
                                    value={item.classification}
                                    disabled={classificationPendingId === item.id}
                                    onChange={(event) =>
                                      void handleClassificationChange(
                                        item.id,
                                        event.target.value as CheckinClassification,
                                      )
                                    }
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-medium text-white outline-none"
                                  >
                                    <option value="CHECKIN">CHECK INS</option>
                                    <option value="BLOCKED">BLACKED OUT</option>
                                    <option value="CANCELLED">Cancelled</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-4 text-sm text-slate-300">
                        {section.emptyMessage}
                      </div>
                    )}
                  </details>
                );
              })}
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
                  className="min-h-11 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/20"
                >
                  <ButtonLabel icon="review">
                    {isEnglish ? "Review on Homes page" : "Revisar na página Casas"}
                  </ButtonLabel>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {officeAssignmentState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[1.75rem] border border-cyan-300/20 bg-slate-950 p-4 shadow-2xl shadow-cyan-950/30 sm:p-6">
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

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => setOfficeAssignmentState(null)}
                className="min-h-11 rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200"
              >
                <ButtonLabel icon="cancel">{isEnglish ? "Later" : "Depois"}</ButtonLabel>
              </button>
              <button
                type="button"
                disabled={!canSaveOfficeAssignments || assigningOffices}
                onClick={handleSaveOfficeAssignments}
                className="min-h-11 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ButtonLabel icon="save">
                  {assigningOffices
                    ? isEnglish
                      ? "Saving..."
                      : "Salvando..."
                    : isEnglish
                      ? "Save offices"
                      : "Salvar escritórios"}
                </ButtonLabel>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
