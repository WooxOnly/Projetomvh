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
    <div className="theme-metric-pill content-safe rounded-2xl px-4 py-3">
      <p className="theme-text-soft text-[11px] uppercase tracking-[0.2em]">{label}</p>
      <p className="theme-heading mt-1 text-base font-medium">{value}</p>
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
      <section className="theme-panel rounded-[1.5rem] p-4 sm:p-5">
        <p className="theme-accent text-xs uppercase tracking-[0.35em]">
          {isEnglish ? "Welcome" : "Bem-vindo"}
        </p>
        <h2 className="theme-heading mt-3 text-xl font-semibold sm:text-2xl">
          {isEnglish ? `Hello, ${session.name}` : `Olá, ${session.name}`}
        </h2>
        <p className="theme-text-muted mt-3 max-w-3xl text-sm leading-6">
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
        <div className="theme-panel rounded-[1.5rem] p-4 sm:p-5">
          <p className="theme-accent text-xs uppercase tracking-[0.35em]">
            {isEnglish ? "Current base" : "Base atual"}
          </p>
          <h3 className="theme-heading mt-3 text-xl font-semibold">
            {isEnglish ? "Active base summary" : "Resumo da base ativa"}
          </h3>

          {data.activeUploadOfficeBreakdown ? (
            <>
              <p className="theme-text-muted mt-2 text-sm">
                {isEnglish ? "Active file" : "Arquivo ativo"}: {formatUploadLabel(data.activeUploadOfficeBreakdown)} |{" "}
                {isEnglish ? "Operation" : "Operação"}:{" "}
                {formatDateOnly(data.activeUploadOfficeBreakdown.operationDate)} | Check-ins:{" "}
                {data.activeUploadOfficeBreakdown.totalCheckins}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {data.activeUploadOfficeBreakdown.offices.map((office) => (
                  <div
                    key={office.officeName}
                    className="theme-panel-soft content-safe rounded-2xl px-4 py-3"
                  >
                    <p className="theme-heading text-base font-medium">{office.officeName}</p>
                    <p className="theme-text-muted mt-2 text-sm">
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
                  className="theme-secondary-button rounded-2xl px-4 py-3 text-sm"
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
                  className="theme-secondary-button rounded-2xl px-4 py-3 text-sm"
                >
                  <ButtonLabel icon="review">
                    {isEnglish ? "Review homes without bedrooms" : "Revisar casas sem quartos"}
                  </ButtonLabel>
                </button>
              </div>
            </>
          ) : (
            <p className="theme-text-muted mt-4 text-sm">
              {isEnglish
                ? "There is no processed upload yet. Use the Import File page to load a spreadsheet and unlock the details."
                : "Ainda não existe upload processado. Use a página Importar Arquivo para carregar uma planilha e liberar o detalhamento da operação."}
            </p>
          )}
        </div>

        <div className="theme-panel rounded-[1.5rem] p-4 sm:p-5">
          <p className="theme-accent text-xs uppercase tracking-[0.35em]">
            {isEnglish ? "Current status" : "Situação atual"}
          </p>
          <h3 className="theme-heading mt-3 text-xl font-semibold">
            {isEnglish ? "Quick view" : "Leitura rápida"}
          </h3>

          <div className="mt-4 space-y-3">
            <div className="theme-panel-soft content-safe rounded-2xl p-4">
              <p className="theme-text-soft text-xs uppercase tracking-[0.25em]">
                {isEnglish ? "Email" : "E-mail"}
              </p>
              <p className="theme-heading mt-2">{session.email}</p>
            </div>

            {data.activeUpload ? (
              <div className="theme-panel-soft content-safe rounded-2xl p-4">
                <p className="theme-text-soft text-xs uppercase tracking-[0.25em]">
                  {isEnglish ? "Active upload" : "Upload ativo"}
                </p>
                <p className="theme-heading mt-2">{formatUploadLabel(data.activeUpload)}</p>
                <p className="theme-text-soft mt-2 text-xs">
                  {isEnglish ? "Processed at" : "Processado em"}{" "}
                  {formatDateTime(data.activeUpload.createdAt)}
                </p>
              </div>
            ) : null}

            {data.latestOperationRun ? (
              <div className="theme-panel-soft content-safe rounded-2xl p-4">
                <p className="theme-text-soft text-xs uppercase tracking-[0.25em]">
                  {isEnglish ? "Latest operation" : "Última operação"}
                </p>
                <p className="theme-heading mt-2">
                  {formatUploadLabel(data.latestOperationRun.spreadsheetUpload)}
                </p>
                <p className="theme-text-soft mt-2 text-xs">
                  {data.latestOperationRun.totalAssignments}{" "}
                  {isEnglish ? "assignments" : "atribuições"} |{" "}
                  {isEnglish ? "mode" : "modo"} {data.latestOperationRun.decisionMode}
                </p>
              </div>
            ) : (
              <div className="theme-panel-soft rounded-2xl border-dashed p-4 text-sm theme-text-muted">
                {isEnglish
                  ? "No operation has been created for this base yet."
                  : "Nenhuma operação foi criada para esta base ainda."}
              </div>
            )}
            <div className="theme-panel-soft content-safe rounded-2xl p-4">
              <p className="theme-text-soft text-xs uppercase tracking-[0.25em]">
                {isEnglish ? "Weekly geo report" : "Relatório geográfico semanal"}
              </p>
              <p className="theme-heading mt-2">
                {data.weeklyLocationMaintenance.totalCheckinsImproved}{" "}
                {isEnglish ? "check-ins improved" : "check-ins melhorados"}
              </p>
              <p className="theme-text-soft mt-2 text-xs">
                {data.weeklyLocationMaintenance.totalPropertiesImproved}{" "}
                {isEnglish ? "homes improved" : "casas melhoradas"} |{" "}
                {data.weeklyLocationMaintenance.totalCondominiumsImproved}{" "}
                {isEnglish ? "resorts improved" : "condomínios melhorados"}
              </p>
              <p className="theme-text-soft mt-2 text-xs">
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
