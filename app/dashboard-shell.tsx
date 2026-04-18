"use client";

import type { ReactElement } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ButtonLabel } from "@/app/button-icon";
import { useLanguage } from "@/app/language-provider";
import { DetailPanel } from "@/app/detail-panel";
import { OperationPanel } from "@/app/operation-panel";
import { UploadFilesPanel } from "@/app/upload-files-panel";

type DashboardShellProps = {
  data: {
    hereApiLockedUntil?: Date | string | null;
    propertyManagers: Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      isActive: boolean;
      officeId: string | null;
      notes: string | null;
      office: {
        id: string;
        name: string;
        address: string | null;
        city: string | null;
        state: string | null;
        zipCode: string | null;
        lat: number | null;
        lng: number | null;
      } | null;
      _count: { properties: number };
    }>;
    offices: Array<{
      id: string;
      name: string;
      slug: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      notes: string | null;
    }>;
    condominiums: Array<{
      id: string;
      nameOriginal: string;
      nameNormalized: string;
      officeId: string | null;
      region: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      notes: string | null;
      office: {
        id: string;
        name: string;
        slug: string;
      } | null;
      _count: { properties: number };
    }>;
    properties: Array<{
      id: string;
      nameOriginal: string;
      nameNormalized: string;
      building: string | null;
      address: string | null;
      bedrooms: number | null;
      hasBbqGrill: boolean | null;
      notes: string | null;
      condominiumId: string | null;
      defaultPropertyManagerId: string | null;
      condominium: { id: string; nameOriginal: string } | null;
      defaultPropertyManager: { id: string; name: string } | null;
    }>;
    activeUpload: {
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
    } | null;
    activeUploadReview: {
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
        classification: "CHECKIN" | "OWNER" | "BLOCKED" | "CANCELLED";
        integratorName: string | null;
        condominiumName: string | null;
        propertyName: string | null;
        building: string | null;
        address: string | null;
        guestName: string | null;
      }>;
    } | null;
    activeUploadOfficeBreakdown: {
      id: string;
      sequenceNumber: number | null;
      fileName: string;
      operationDate: Date | string;
      createdAt: Date | string;
      totalCheckins: number;
      offices: Array<{
        officeId: string | null;
        officeName: string;
        officeSlug: string | null;
        regions: Array<{
          region: string;
          condominiumCount: number;
          houseCount: number;
          condominiums: Array<{
            condominiumId: string;
            condominiumName: string;
            houseCount: number;
            checkinCount: number;
            houseNames: string[];
          }>;
        }>;
      }>;
    } | null;
    uploadHistory: Array<{
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
      importedPropertyManagers: Array<{
        id: string | null;
        name: string;
      }>;
      ownerCheckins: Array<{
        id: string;
        sourceRowNumber: number | null;
        integratorName: string | null;
        condominiumName: string | null;
        propertyName: string | null;
        building: string | null;
        address: string | null;
      }>;
    }>;
    latestOperationRun: {
      id: string;
      operationDate: Date | string;
      decisionMode: string;
      useSpreadsheetPmAssignments: boolean;
      preventMixedCondominiumOffices: boolean;
      forceEqualCheckins: boolean;
      endRouteNearOffice: boolean;
      routeAnalysisJson?: string | null;
      routeAnalysisSource?: string | null;
      routeAnalysisModel?: string | null;
      routeAnalysisGeneratedAt?: Date | string | null;
      status: string;
      totalCheckins: number;
      totalAssignments: number;
      createdAt: Date | string;
      spreadsheetUpload: { id: string; fileName: string; sequenceNumber: number | null };
      availablePMs: Array<{
        propertyManagerId: string;
        temporaryOfficeId: string | null;
        temporaryOffice: {
          id: string;
          name: string;
          address: string | null;
          city: string | null;
          state: string | null;
          zipCode: string | null;
          lat: number | null;
          lng: number | null;
        } | null;
      }>;
      assignments: Array<{
        id: string;
        routeOrder: number;
        workload: number;
        source: string;
        propertyManager: {
          id: string;
          name: string;
          officeId: string | null;
          office: {
            id: string;
            name: string;
            address: string | null;
            city: string | null;
            state: string | null;
            zipCode: string | null;
            lat: number | null;
            lng: number | null;
          } | null;
        };
        checkin: {
          id: string;
          condominiumName: string | null;
          propertyName: string | null;
          building: string | null;
          address: string | null;
          bedroomsSnapshot: number | null;
          integratorName: string | null;
          guestName: string | null;
          numberOfNights: number | null;
          doorCode: string | null;
          hasBbqGrill: boolean | null;
          lat: number | null;
          lng: number | null;
        };
      }>;
    } | null;
  };
};

type TabKey = "uploads" | "details" | "availability" | "route";

function TabGroup({
  items,
  activeTab,
  onSelect,
}: {
  items: Array<{ key: TabKey; label: string; icon: "upload" | "details" | "managers" | "route" }>;
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
}) {
  return (
    <div className="mobile-tab-row md:flex md:flex-wrap md:gap-3 md:overflow-visible md:pb-0">
      {items.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition ${
            activeTab === tab.key
              ? "theme-tab-button-active"
              : "theme-tab-button"
          }`}
        >
          <ButtonLabel icon={tab.icon}>{tab.label}</ButtonLabel>
        </button>
      ))}
    </div>
  );
}

function formatHeaderDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatUploadLabel(upload: { sequenceNumber: number | null; fileName: string }) {
  const prefix = upload.sequenceNumber != null ? `#${upload.sequenceNumber} ` : "";
  return `${prefix}${upload.fileName}`;
}

export function DashboardShell({ data }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isEnglish } = useLanguage();
  const requestedTab = searchParams.get("tab");

  const tabs: Array<{ key: TabKey; label: string; icon: "upload" | "details" | "managers" | "route" }> = [
    { key: "uploads", label: isEnglish ? "Import File" : "Importar Arquivo", icon: "upload" },
    { key: "details", label: isEnglish ? "Details" : "Detalhamento", icon: "details" },
    {
      key: "availability",
      label: isEnglish ? "Managers of the Day" : "Gerentes do Dia",
      icon: "managers",
    },
    { key: "route", label: isEnglish ? "Best Route" : "Melhor Rota", icon: "route" },
  ];

  const tabMeta: Record<TabKey, { eyebrow: string; title: string; description: string }> = {
    uploads: {
      eyebrow: isEnglish ? "Flow" : "Fluxo",
      title: isEnglish ? "Import File" : "Importar Arquivo",
      description: isEnglish
        ? "Upload the operational spreadsheet and activate the base that will be used in the next steps."
        : "Envie a planilha operacional e ative a base que será usada nas próximas etapas.",
    },
    details: {
      eyebrow: isEnglish ? "Flow" : "Fluxo",
      title: isEnglish ? "Details" : "Detalhamento",
      description: isEnglish
        ? "Read the distribution by offices and resorts using the active upload from the system."
        : "Leia a distribuição por escritórios e condomínios usando o upload ativo do sistema.",
    },
    availability: {
      eyebrow: isEnglish ? "Flow" : "Fluxo",
      title: isEnglish ? "Property Managers of the Day" : "Gerentes de Propriedades do Dia",
      description: isEnglish
        ? "Select who is available and assemble the operation based on the active upload."
        : "Selecione quem está disponível e monte a operação com base no upload ativo.",
    },
    route: {
      eyebrow: isEnglish ? "Flow" : "Fluxo",
      title: isEnglish ? "Best Route" : "Melhor Rota",
      description: isEnglish
        ? "Review the final route, export the PDF, and prepare the operational output."
        : "Revise a rota final, exporte o PDF e prepare a saída operacional.",
    },
  };

  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? (requestedTab as TabKey)
    : "uploads";

  function selectTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const activeTabMeta = tabMeta[activeTab];
  const activeUploadLabel = data.activeUpload
    ? `${formatUploadLabel(data.activeUpload)} | ${formatHeaderDate(data.activeUpload.operationDate)}`
    : isEnglish
      ? "No active base selected"
      : "Nenhuma base ativa selecionada";

  let activePanel: ReactElement | null = null;

  switch (activeTab) {
    case "uploads":
      activePanel = (
        <UploadFilesPanel
          offices={data.offices.map((office) => ({ id: office.id, name: office.name }))}
          activeUploadReview={data.activeUploadReview}
          onOpenDetailsTab={() => selectTab("details")}
          onOpenPropertiesTab={() => router.push("/dashboard/cadastros?tab=properties")}
        />
      );
      break;
    case "details":
      activePanel = (
        <DetailPanel data={data} onOpenAvailabilityTab={() => selectTab("availability")} />
      );
      break;
    case "availability":
      activePanel = (
        <OperationPanel
          data={data}
          mode="availability"
          onOpenRouteTab={() => selectTab("route")}
        />
      );
      break;
    case "route":
      activePanel = <OperationPanel data={data} mode="route" />;
      break;
  }

  return (
    <div className="space-y-6">
      <section className="theme-panel rounded-[1.5rem] p-4 sm:p-5">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
            <p className="theme-accent text-xs uppercase tracking-[0.35em]">
              {isEnglish ? "Flow" : "Fluxo"}
            </p>
            <h2 className="theme-heading mt-3 text-lg font-semibold sm:text-xl">
              {isEnglish ? "Operational flow" : "Fluxo operacional"}
            </h2>
            <p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">
              {isEnglish
                ? "This page centralizes the flow of the day. The active upload remains global, but the process stays separate from the home page and the history page."
                : "Esta página concentra o fluxo do dia. O upload ativo continua global, mas o processo fica separado da página inicial e da página de histórico."}
            </p>
            </div>
            <div className="theme-panel-soft rounded-2xl px-4 py-3 xl:min-w-80">
              <p className="theme-text-soft text-[11px] uppercase tracking-[0.25em]">
                {isEnglish ? "Active base" : "Base ativa"}
              </p>
              <p className="theme-heading mt-1 text-sm font-medium">{activeUploadLabel}</p>
            </div>
          </div>

          <TabGroup items={tabs} activeTab={activeTab} onSelect={selectTab} />
        </div>
      </section>

      <section
        key={activeTab}
        className="theme-panel dashboard-panel-enter rounded-[1.5rem] p-3 sm:p-4"
      >
        <div className="theme-panel-strong mb-4 rounded-[1.25rem] px-4 py-3">
          <p className="theme-accent text-xs uppercase tracking-[0.35em]">
            {activeTabMeta.eyebrow}
          </p>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="theme-heading text-xl font-semibold">{activeTabMeta.title}</h3>
            {data.activeUpload ? (
              <span className="theme-badge rounded-full px-3 py-1 text-xs">
                {activeUploadLabel}
              </span>
            ) : null}
          </div>
          <p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">
            {activeTabMeta.description}
          </p>
        </div>
        {activePanel}
      </section>
    </div>
  );
}



