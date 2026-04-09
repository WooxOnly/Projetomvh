"use client";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";

type OverviewPanelProps = {
  session: {
    name: string;
    email: string;
    role: string;
  };
  detailsHref: string;
  propertiesHref: string;
  data: {
    activeUpload: {
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
    } | null;
    offices: Array<{ id: string }>;
    propertyManagers: Array<{ id: string; isActive: boolean }>;
    condominiums: Array<{ id: string }>;
    properties: Array<{ id: string; bedrooms: number | null }>;
    pendingLocationReviews: number;
    weeklyLocationMaintenance: {
      totalRuns: number;
      totalCondominiumsImproved: number;
      totalPropertiesImproved: number;
      totalCheckinsImproved: number;
      latestRunAt: Date | string | null;
    };
    latestOperationRun: {
      createdAt: Date | string;
      decisionMode: string;
      totalAssignments: number;
      spreadsheetUpload: { fileName: string; sequenceNumber: number | null };
    } | null;
    activeUploadOfficeBreakdown: {
      fileName: string;
      sequenceNumber: number | null;
      operationDate: Date | string;
      totalCheckins: number;
      offices: Array<{
        officeName: string;
        regions: Array<{
          region: string;
          condominiumCount: number;
          houseCount: number;
        }>;
      }>;
    } | null;
  };
};

function formatUploadLabel(upload: { sequenceNumber: number | null; fileName: string }) {
  const prefix = upload.sequenceNumber != null ? `#${upload.sequenceNumber} ` : "";
  return `${prefix}${upload.fileName}`;
}

function CompactMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="content-safe rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-medium text-white">{value}</p>
    </div>
  );
}

export function OverviewPanel({ session, detailsHref, propertiesHref, data }: OverviewPanelProps) {
  const { isEnglish } = useLanguage();
  const locale = isEnglish ? "en-US" : "pt-BR";
  const activeManagers = data.propertyManagers.filter((item) => item.isActive);
  const propertiesWithoutBedrooms = data.properties.filter((item) => item.bedrooms == null).length;

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

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-cyan-400/10 bg-slate-950/40 p-4 sm:p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
          {isEnglish ? "Welcome" : "Bem-vindo"}
        </p>
        <h2 className="mt-3 text-xl font-semibold text-white sm:text-2xl">
          {isEnglish ? `Hello, ${session.name}` : `Olá, ${session.name}`}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          {isEnglish
            ? "This page is reserved for the general view. The operational process continues in the import, details, managers of the day, and best route pages."
            : "Esta página fica reservada para a visão geral. O processo operacional continua nas páginas de importação, detalhamento, gerentes do dia e melhor rota."}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <CompactMetric label={isEnglish ? "Email" : "E-mail"} value={session.email} />
          <CompactMetric
            label={isEnglish ? "Status" : "Status"}
            value={isEnglish ? "Active session" : "Sessão ativa"}
          />
          <CompactMetric label={isEnglish ? "Profile" : "Perfil"} value={session.role} />
          <CompactMetric
            label={isEnglish ? "Active property managers" : "Gerentes ativos"}
            value={activeManagers.length}
          />
          <CompactMetric label={isEnglish ? "Offices" : "Escritórios"} value={data.offices.length} />
          <CompactMetric
            label={isEnglish ? "Homes without bedrooms" : "Casas sem quartos"}
            value={propertiesWithoutBedrooms}
          />
          <CompactMetric
            label={isEnglish ? "Pending location reviews" : "Revisões de localização"}
            value={data.pendingLocationReviews}
          />
          <CompactMetric
            label={isEnglish ? "Geo maintenance in 7 days" : "Manutenção geográfica em 7 dias"}
            value={data.weeklyLocationMaintenance.totalRuns}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            {isEnglish ? "Current base" : "Base atual"}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">
            {isEnglish ? "Active base summary" : "Resumo da base ativa"}
          </h3>

          {data.activeUploadOfficeBreakdown ? (
            <>
              <p className="mt-2 text-sm text-slate-300">
                {isEnglish ? "Active file" : "Arquivo ativo"}: {formatUploadLabel(data.activeUploadOfficeBreakdown)} |{" "}
                {isEnglish ? "Operation" : "Operação"}:{" "}
                {formatDateOnly(data.activeUploadOfficeBreakdown.operationDate)} | Check-ins:{" "}
                {data.activeUploadOfficeBreakdown.totalCheckins}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {data.activeUploadOfficeBreakdown.offices.map((office) => (
                  <div
                    key={office.officeName}
                    className="content-safe rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <p className="text-base font-medium text-white">{office.officeName}</p>
                    <p className="mt-2 text-sm text-slate-300">
                      {office.regions.reduce((total, region) => total + region.condominiumCount, 0)}{" "}
                      {isEnglish ? "resorts" : "condomínios"} |{" "}
                      {office.regions.reduce((total, region) => total + region.houseCount, 0)}{" "}
                      {isEnglish ? "homes" : "casas"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = detailsHref;
                  }}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200"
                >
                  <ButtonLabel icon="details">
                    {isEnglish ? "Open full details" : "Abrir detalhamento completo"}
                  </ButtonLabel>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = propertiesHref;
                  }}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200"
                >
                  <ButtonLabel icon="review">
                    {isEnglish ? "Review homes without bedrooms" : "Revisar casas sem quartos"}
                  </ButtonLabel>
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-300">
              {isEnglish
                ? "There is no processed upload yet. Use the Import File page to load a spreadsheet and unlock the details."
                : "Ainda não existe upload processado. Use a página Importar Arquivo para carregar uma planilha e liberar o detalhamento da operação."}
            </p>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            {isEnglish ? "Current status" : "Situação atual"}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">
            {isEnglish ? "Quick view" : "Leitura rápida"}
          </h3>

          <div className="mt-4 space-y-3">
            <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                {isEnglish ? "Email" : "E-mail"}
              </p>
              <p className="mt-2 text-white">{session.email}</p>
            </div>

            {data.activeUpload ? (
              <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  {isEnglish ? "Active upload" : "Upload ativo"}
                </p>
                <p className="mt-2 text-white">{formatUploadLabel(data.activeUpload)}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {isEnglish ? "Processed at" : "Processado em"}{" "}
                  {formatDateTime(data.activeUpload.createdAt)}
                </p>
              </div>
            ) : null}

            {data.latestOperationRun ? (
              <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  {isEnglish ? "Latest operation" : "Última operação"}
                </p>
                <p className="mt-2 text-white">
                  {formatUploadLabel(data.latestOperationRun.spreadsheetUpload)}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {data.latestOperationRun.totalAssignments}{" "}
                  {isEnglish ? "assignments" : "atribuições"} |{" "}
                  {isEnglish ? "mode" : "modo"} {data.latestOperationRun.decisionMode}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-300">
                {isEnglish
                  ? "No operation has been created for this base yet."
                  : "Nenhuma operação foi criada para esta base ainda."}
              </div>
            )}
            <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                {isEnglish ? "Weekly geo report" : "Relatório geográfico semanal"}
              </p>
              <p className="mt-2 text-white">
                {data.weeklyLocationMaintenance.totalCheckinsImproved}{" "}
                {isEnglish ? "check-ins improved" : "check-ins melhorados"}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {data.weeklyLocationMaintenance.totalPropertiesImproved}{" "}
                {isEnglish ? "homes improved" : "casas melhoradas"} |{" "}
                {data.weeklyLocationMaintenance.totalCondominiumsImproved}{" "}
                {isEnglish ? "resorts improved" : "condomínios melhorados"}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {data.weeklyLocationMaintenance.latestRunAt
                  ? `${isEnglish ? "Last run" : "Última execução"} ${formatDateTime(data.weeklyLocationMaintenance.latestRunAt)}`
                  : isEnglish
                    ? "No weekly run recorded yet."
                    : "Nenhuma execução semanal registrada ainda."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
