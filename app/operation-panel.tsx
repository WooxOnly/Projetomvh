"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";

import { useLanguage } from "@/app/language-provider";
import { RouteLiveMap } from "@/app/route-live-map";
import { RouteOverviewMap } from "@/app/route-overview-map";

type OperationPanelProps = {
  mode?: "availability" | "route" | "full";
  onOpenRouteTab?: () => void;
  data: {
    activeUpload: {
      id: string;
      sequenceNumber: number | null;
      fileName: string;
      operationDate: Date | string;
    } | null;
    propertyManagers: Array<{
      id: string;
      name: string;
      phone: string | null;
      isActive: boolean;
      officeId?: string | null;
      office?: {
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
    offices: Array<{
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
    }>;
    uploadHistory: Array<{
      id: string;
      sequenceNumber: number | null;
      fileName: string;
      operationDate: Date | string;
      importedPropertyManagers: Array<{
        id: string | null;
        name: string;
      }>;
    }>;
    latestOperationRun: {
      id: string;
      operationDate: Date | string;
      decisionMode: string;
      preventMixedCondominiumOffices: boolean;
      forceEqualCheckins: boolean;
      status: string;
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

function formatUploadLabel(upload: { sequenceNumber: number | null; fileName: string }) {
  const prefix = upload.sequenceNumber != null ? `#${upload.sequenceNumber} ` : "";
  return `${prefix}${upload.fileName}`;
}

function cleanPropertyManagerName(name: string) {
  return name.replace(/^Responsible\s+/i, "").trim() || name;
}

function ActionLoadingLabel({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-5 w-5 rounded-full bg-cyan-300/20 animate-ping" />
        <span className="inline-flex h-4 w-4 rounded-full border-2 border-cyan-200/40 border-t-cyan-300 animate-spin" />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span>{primary}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-200/80">
          {secondary}
        </span>
      </span>
    </span>
  );
}

type RouteAnalysisData = {
  source: "heuristic" | "openai";
  model: string | null;
  generatedAt: string;
  overallScore: number;
  totalEstimatedDistanceKm: number;
  coordinateCoveragePercent: number;
  overallSummary: string;
  routeHighlights: string[];
  routeRisks: string[];
  managers: Array<{
    propertyManagerId: string;
    managerName: string;
    phone: string | null;
    officeName: string;
    officeAddress: string;
    stops: number;
    workload: number;
    routeScore: number;
    coordinateCoveragePercent: number;
    officeOriginCoverage: boolean;
    estimatedDistanceKm: number;
    clusters: string[];
    summary: string;
    risk: string;
    hint: string;
    mapPoints: Array<{
      label: string;
      shortLabel: string;
      order: number;
      lat: number;
      lng: number;
      isOffice: boolean;
      inferred?: boolean;
    }>;
  }>;
};

type WhatsAppExportData = {
  combinedText: string;
  managerMessages: Array<{
    propertyManagerId: string;
    managerName: string;
    phone: string | null;
    text: string;
  }>;
};

type LatestOperationRun = NonNullable<OperationPanelProps["data"]["latestOperationRun"]>;
type LatestOperationAssignment = LatestOperationRun["assignments"][number];
type LatestOperationPropertyManager = LatestOperationAssignment["propertyManager"];

type IsolatedStopAnalysis = {
  isolatedCount: number;
  worstGapMiles: number;
  labels: string[];
};

function formatOfficeAddress(
  office:
    | {
        address: string | null;
        city: string | null;
        state: string | null;
        zipCode: string | null;
      }
    | null
    | undefined,
) {
  if (!office) {
    return "Office without address defined";
  }

  return (
    [office.address, office.city, office.state, office.zipCode].filter(Boolean).join(" | ") ||
    "Office without address defined"
  );
}

function getScoreStyle(score: number) {
  if (score >= 85) {
    return {
      text: "text-emerald-300",
      border: "border-emerald-400/30",
      progress: "bg-emerald-400",
    };
  }

  if (score >= 70) {
    return {
      text: "text-cyan-300",
      border: "border-cyan-400/30",
      progress: "bg-cyan-300",
    };
  }

  return {
    text: "text-amber-300",
    border: "border-amber-400/30",
    progress: "bg-amber-300",
  };
}

function formatPercent(value: number | null | undefined) {
  return `${value ?? 0}%`;
}

function isWithinServiceArea(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat == null || lng == null) {
    return false;
  }

  return lat >= 27.95 && lat <= 28.85 && lng >= -81.85 && lng <= -80.95;
}

function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 10) / 10;
}

function kmToMiles(value: number) {
  return Math.round(value * 0.621371 * 10) / 10;
}

function analyzeIsolatedStops(
  assignments: LatestOperationRun["assignments"],
  office:
    | {
        lat: number | null;
        lng: number | null;
      }
    | null
    | undefined,
): IsolatedStopAnalysis {
  const routeAssignments = [...assignments]
    .filter((assignment) => isWithinServiceArea(assignment.checkin.lat, assignment.checkin.lng))
    .sort((left, right) => left.routeOrder - right.routeOrder);

  if (routeAssignments.length < 3) {
    return {
      isolatedCount: 0,
      worstGapMiles: 0,
      labels: [],
    };
  }

  const labels: string[] = [];
  let worstGapMiles = 0;
  const officePoint =
    office?.lat != null && office.lng != null
      ? { lat: office.lat, lng: office.lng }
      : null;

  const legDistances = routeAssignments.map((assignment, index) => {
    const currentPoint = {
      lat: assignment.checkin.lat!,
      lng: assignment.checkin.lng!,
    };
    const previousPoint =
      index === 0
        ? officePoint
        : {
            lat: routeAssignments[index - 1]!.checkin.lat!,
            lng: routeAssignments[index - 1]!.checkin.lng!,
          };

    return previousPoint ? kmToMiles(haversineDistanceKm(previousPoint, currentPoint)) : 0;
  });

  const averageLegDistance =
    legDistances.length > 0
      ? legDistances.reduce((total, distance) => total + distance, 0) / legDistances.length
      : 0;

  routeAssignments.forEach((assignment, index) => {
    const currentPoint = {
      lat: assignment.checkin.lat!,
      lng: assignment.checkin.lng!,
    };
    const previousPoint =
      index === 0
        ? officePoint
        : {
            lat: routeAssignments[index - 1]!.checkin.lat!,
            lng: routeAssignments[index - 1]!.checkin.lng!,
          };
    const nextPoint =
      index === routeAssignments.length - 1
        ? null
        : {
            lat: routeAssignments[index + 1]!.checkin.lat!,
            lng: routeAssignments[index + 1]!.checkin.lng!,
          };

    const previousDistance =
      previousPoint == null ? Number.POSITIVE_INFINITY : kmToMiles(haversineDistanceKm(previousPoint, currentPoint));
    const nextDistance =
      nextPoint == null ? Number.POSITIVE_INFINITY : kmToMiles(haversineDistanceKm(currentPoint, nextPoint));
    const nearestLeg = Math.min(previousDistance, nextDistance);

    if (nearestLeg > Math.max(6, averageLegDistance * 1.9)) {
      labels.push(
        assignment.checkin.propertyName ??
          assignment.checkin.address ??
          assignment.checkin.condominiumName ??
          `Stop ${assignment.routeOrder}`,
      );
      worstGapMiles = Math.max(worstGapMiles, nearestLeg);
    }
  });

  return {
    isolatedCount: labels.length,
    worstGapMiles: Math.round(worstGapMiles * 10) / 10,
    labels: labels.slice(0, 3),
  };
}

function buildFallbackMapPoints(
  manager: LatestOperationPropertyManager,
  assignments: LatestOperationRun["assignments"],
  isEnglish: boolean,
  officeOverride:
    | {
        id: string;
        name: string;
        address: string | null;
        city: string | null;
        state: string | null;
        zipCode: string | null;
        lat: number | null;
        lng: number | null;
      }
    | null = null,
) {
  const effectiveOffice = officeOverride ?? manager.office;
  const actualAssignments = assignments.filter((assignment) =>
    isWithinServiceArea(assignment.checkin.lat, assignment.checkin.lng),
  );
  const officePoint = isWithinServiceArea(effectiveOffice?.lat, effectiveOffice?.lng)
    ? { lat: effectiveOffice!.lat!, lng: effectiveOffice!.lng! }
    : null;
  const firstActualPoint = actualAssignments[0]
    ? { lat: actualAssignments[0].checkin.lat!, lng: actualAssignments[0].checkin.lng! }
    : null;
  const anchor = officePoint ?? firstActualPoint ?? { lat: 28.332, lng: -81.4925 };

  return [
    {
      label: effectiveOffice?.name ?? (isEnglish ? "Operational origin" : "Origem operacional"),
      shortLabel: "O",
      order: 0,
      lat: anchor.lat,
      lng: anchor.lng,
      isOffice: true,
      inferred: officePoint == null,
    },
    ...assignments.map((assignment, index) => {
      const inferred = !isWithinServiceArea(assignment.checkin.lat, assignment.checkin.lng);
      const fallbackRadius = 0.003 + (index % 5) * 0.001;
      const fallbackAngle = ((index * 53) % 360) * (Math.PI / 180);

      return {
        label:
          assignment.checkin.propertyName ||
          assignment.checkin.condominiumName ||
          `Stop ${assignment.routeOrder}`,
        shortLabel: String(assignment.routeOrder),
        order: assignment.routeOrder,
        lat: inferred ? anchor.lat + Math.sin(fallbackAngle) * fallbackRadius : assignment.checkin.lat!,
        lng: inferred ? anchor.lng + Math.cos(fallbackAngle) * fallbackRadius : assignment.checkin.lng!,
        isOffice: false,
        inferred,
      };
    }),
  ];
}

function buildFallbackRouteAnalysis(
  latestOperationRun: LatestOperationRun,
  propertyManagers: OperationPanelProps["data"]["propertyManagers"],
  isEnglish: boolean,
  temporaryOfficeByManagerId = new Map<
    string,
    {
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      lat: number | null;
      lng: number | null;
    }
  >(),
): RouteAnalysisData {
  const propertyManagersById = new Map(propertyManagers.map((item) => [item.id, item]));

  const grouped = latestOperationRun.assignments.reduce<
    Map<
      string,
      {
        manager: LatestOperationPropertyManager;
        assignments: LatestOperationRun["assignments"];
      }
    >
  >((map, assignment) => {
    const existing = map.get(assignment.propertyManager.id);
    if (existing) {
      existing.assignments.push(assignment);
    } else {
      map.set(assignment.propertyManager.id, {
        manager: assignment.propertyManager,
        assignments: [assignment],
      });
    }
    return map;
  }, new Map());

  const managers = Array.from(grouped.values())
    .sort((left, right) =>
      cleanPropertyManagerName(left.manager.name).localeCompare(
        cleanPropertyManagerName(right.manager.name),
      ),
    )
    .map(({ manager, assignments }) => {
      const effectiveOffice = temporaryOfficeByManagerId.get(manager.id) ?? manager.office;
      const directoryManager = propertyManagersById.get(manager.id);
      const validAssignments = assignments.filter((assignment) =>
        isWithinServiceArea(assignment.checkin.lat, assignment.checkin.lng),
      );
      const coverage = assignments.length
        ? Math.round((validAssignments.length / assignments.length) * 100)
        : 0;
      const officeOriginCoverage = isWithinServiceArea(effectiveOffice?.lat, effectiveOffice?.lng);
      const mapPoints = buildFallbackMapPoints(manager, assignments, isEnglish, effectiveOffice);
      const clusters = Array.from(
        new Set(
          assignments
            .map((assignment) => assignment.checkin.condominiumName || "No resort")
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right));

      let estimatedDistanceKm = 0;
      const routeAssignments = assignments.filter((assignment) =>
        isWithinServiceArea(assignment.checkin.lat, assignment.checkin.lng),
      );
      if (routeAssignments.length > 0) {
        let previousPoint = officeOriginCoverage
          ? { lat: effectiveOffice!.lat!, lng: effectiveOffice!.lng! }
          : { lat: routeAssignments[0]!.checkin.lat!, lng: routeAssignments[0]!.checkin.lng! };
        for (const assignment of routeAssignments) {
          const current = { lat: assignment.checkin.lat!, lng: assignment.checkin.lng! };
          estimatedDistanceKm += haversineDistanceKm(previousPoint, current);
          previousPoint = current;
        }
        estimatedDistanceKm = kmToMiles(estimatedDistanceKm);
      }

      const routeScore = Math.max(
        25,
        Math.min(
          100,
          Math.round(coverage * 0.45 + (officeOriginCoverage ? 18 : 6) + Math.max(10, 30 - clusters.length * 4)),
        ),
      );

      return {
        propertyManagerId: manager.id,
        managerName: cleanPropertyManagerName(manager.name),
        phone: directoryManager?.phone ?? null,
        officeName: effectiveOffice?.name ?? (isEnglish ? "Office not defined" : "Escritório não definido"),
        officeAddress: formatOfficeAddress(effectiveOffice),
        stops: assignments.length,
        workload: assignments.reduce((total, assignment) => total + assignment.workload, 0),
        routeScore,
        coordinateCoveragePercent: coverage,
        officeOriginCoverage,
        estimatedDistanceKm,
        clusters,
        summary:
          coverage > 0
            ? isEnglish
              ? `${assignments.length} check-ins with immediate local route reading.`
              : `${assignments.length} check-ins com leitura local imediata da rota.`
            : isEnglish
              ? `${assignments.length} check-ins still waiting for more complete geolocation.`
              : `${assignments.length} check-ins aguardando geolocalização mais completa.`,
        risk:
          coverage < 60
            ? isEnglish
              ? "Coordinates are still missing in part of the base, so the route still depends on textual addresses."
              : "Ainda faltam coordenadas em parte da base, então a rota ainda depende de endereço textual."
            : isEnglish
              ? "Moderate operational risk within the current configuration."
              : "Risco operacional moderado dentro da configuração atual.",
        hint:
          coverage < 100
            ? isEnglish
              ? "Updating resort coordinates and addresses considerably improves the final route."
              : "Atualizar coordenadas e endereço dos condomínios melhora bastante a rota final."
            : isEnglish
              ? "The route already has enough coordinates to move on to the final output."
              : "A rota já tem coordenadas suficientes para seguir para a saída final.",
        mapPoints,
      };
    });

  const totalStops = managers.reduce((total, manager) => total + manager.stops, 0);
  const totalEstimatedDistanceKm = Math.round(
    managers.reduce((total, manager) => total + manager.estimatedDistanceKm, 0) * 10,
  ) / 10;
  const coordinateCoveragePercent = totalStops
    ? Math.round(
        managers.reduce(
          (total, manager) => total + manager.coordinateCoveragePercent * manager.stops,
          0,
        ) / totalStops,
      )
    : 0;
  const overallScore = managers.length
    ? Math.round(managers.reduce((total, manager) => total + manager.routeScore, 0) / managers.length)
    : 0;

  return {
    source: "heuristic",
    model: null,
    generatedAt: new Date().toISOString(),
    overallScore,
    totalEstimatedDistanceKm,
    coordinateCoveragePercent,
    overallSummary:
      isEnglish
        ? "Immediate local reading of the operation loaded with the data already available in the system."
        : "Leitura local imediata da operação carregada com os dados já disponíveis no sistema.",
    routeHighlights: [
      isEnglish
        ? `${latestOperationRun.totalAssignments} check-ins ready for final review.`
        : `${latestOperationRun.totalAssignments} check-ins prontos para revisão final.`,
      isEnglish
        ? `${managers.length} property managers already have a route in this operation.`
        : `${managers.length} gerentes de propriedades com rota montada nesta operação.`,
      isEnglish
        ? `${coordinateCoveragePercent}% of the operation already has valid coordinates in the local area.`
        : `${coordinateCoveragePercent}% da operação já possui coordenadas válidas na área local.`,
    ],
    routeRisks: [
      coordinateCoveragePercent < 80
        ? isEnglish
          ? "Coordinates are still missing in part of the base, so full AI analysis may take longer to enrich the route."
          : "Ainda faltam coordenadas em parte da base, então a IA completa pode levar mais tempo para enriquecer a rota."
        : isEnglish
          ? "The geolocated base is already consistent for operational reading."
          : "A base geolocalizada já está consistente para a leitura operacional.",
      isEnglish
        ? "Review offices, resorts, and addresses whenever any card shows low coverage."
        : "Revise escritórios, condomínios e endereços sempre que algum card mostrar cobertura baixa.",
    ],
    managers,
  };
}

async function readJsonResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "A operação falhou.");
  }

  return payload;
}

async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  await readJsonResponse<{ ok?: boolean }>(response);
}

async function fetchRouteAnalysis(refresh = false) {
  const searchParams = new URLSearchParams();
  if (refresh) {
    searchParams.set("refresh", "1");
  }

  const response = await fetch(
    `/api/operations/latest/analysis${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    { cache: "no-store" },
  );
  return readJsonResponse<{ ok: true; analysis: RouteAnalysisData }>(response);
}

async function rebuildLatestOperation(useHereRouting = false) {
  const response = await fetch("/api/operations/latest/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useHereRouting }),
  });

  return readJsonResponse<{ ok: true }>(response);
}

async function runOperation(body: {
  spreadsheetUploadId: string;
  decisionMode: "default" | "override";
  availablePropertyManagerIds: string[];
  preventMixedCondominiumOffices: boolean;
  forceEqualCheckins: boolean;
  temporaryOfficeByManagerId: Record<string, string>;
}) {
  const response = await fetch("/api/operations/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return readJsonResponse<{ ok: true }>(response);
}

async function fetchWhatsAppExport(propertyManagerId?: string) {
  const searchParams = new URLSearchParams();
  if (propertyManagerId) {
    searchParams.set("propertyManagerId", propertyManagerId);
  }

  const response = await fetch(
    `/api/operations/latest/whatsapp${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    { cache: "no-store" },
  );
  return readJsonResponse<{ ok: true } & WhatsAppExportData>(response);
}

async function downloadLatestOperationPdf(language: "pt-BR" | "en-US", propertyManagerId?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("language", language);
  if (propertyManagerId) {
    searchParams.set("propertyManagerId", propertyManagerId);
  }

  const response = await fetch(`/api/operations/latest/pdf${searchParams.size ? `?${searchParams.toString()}` : ""}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? "Could not generate the PDF.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const disposition = response.headers.get("Content-Disposition");
  const fileNameMatch = disposition?.match(/filename=\"([^\"]+)\"/i);
  anchor.href = objectUrl;
  anchor.download = fileNameMatch?.[1] ?? "operation-route.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function OperationPanel({ data, mode = "full", onOpenRouteTab }: OperationPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isEnglish } = useLanguage();
  const locale = isEnglish ? "en-US" : "pt-BR";
  const currentTab = searchParams.get("tab");
  const shouldHideSuccessModal = mode === "route" || currentTab === "route";
  const latestOperationRun = data.latestOperationRun;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [persistentSuccessMessage, setPersistentSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [rebuildTarget, setRebuildTarget] = useState<"local" | "here" | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analysis, setAnalysis] = useState<RouteAnalysisData | null>(null);
  const [whatsAppPendingTarget, setWhatsAppPendingTarget] = useState<string | null>(null);
  const [pdfPendingTarget, setPdfPendingTarget] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState("");
  const [whatsAppExport, setWhatsAppExport] = useState<WhatsAppExportData | null>(null);
  const [copyState, setCopyState] = useState("");
  const [expandedStopManagers, setExpandedStopManagers] = useState<string[]>([]);
  const [operationPending, setOperationPending] = useState(false);
  const [hasManualSelectionChanges, setHasManualSelectionChanges] = useState(false);
  const [form, setForm] = useState({
    spreadsheetUploadId: data.activeUpload?.id ?? "",
    decisionMode: "default",
    availablePropertyManagerIds: [] as string[],
    preventMixedCondominiumOffices: true,
    forceEqualCheckins: false,
    temporaryOfficeByManagerId: {} as Record<string, string>,
  });

  function persistFlashMessage(nextMessage: string) {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem("operation-panel-persistent-success-message", nextMessage);
  }

  function formatPanelDateOnly(value: Date | string) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }

  function formatPanelDateTime(value: Date | string) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function getOfficeAddress(
    office:
      | {
          address: string | null;
          city: string | null;
          state: string | null;
          zipCode: string | null;
        }
      | null
      | undefined,
  ) {
    const fallback = isEnglish ? "Office without address defined" : "Escritório sem endereço definido";

    if (!office) {
      return fallback;
    }

    return [office.address, office.city, office.state, office.zipCode].filter(Boolean).join(" | ") || fallback;
  }

  function getEffectiveManagerOffice(
    manager: LatestOperationPropertyManager,
  ) {
    return latestOperationTemporaryOfficeMap.get(manager.id) ?? manager.office ?? null;
  }

  const selectedUpload = useMemo(
    () => data.uploadHistory.find((item) => item.id === form.spreadsheetUploadId) ?? null,
    [data.uploadHistory, form.spreadsheetUploadId],
  );

  const allPropertyManagersSorted = useMemo(
    () => [...data.propertyManagers].sort((left, right) => left.name.localeCompare(right.name)),
    [data.propertyManagers],
  );

  const latestOperationTemporaryOfficeMap = useMemo(
    () =>
      new Map(
        data.latestOperationRun?.availablePMs
          ?.filter((item) => item.temporaryOffice)
          .map((item) => [item.propertyManagerId, item.temporaryOffice!]) ?? [],
      ),
    [data.latestOperationRun],
  );

  const propertyManagerNameCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of data.propertyManagers) {
      const normalizedName = cleanPropertyManagerName(item.name).trim().toLowerCase();
      counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
    }

    return counts;
  }, [data.propertyManagers]);

  const importedManagerSelection = useMemo(() => {
    if (!selectedUpload) {
      return {
        matchedManagers: [] as OperationPanelProps["data"]["propertyManagers"],
        matchedIds: [] as string[],
        unresolvedNames: [] as string[],
      };
    }

    const importedIds = new Set(
      selectedUpload.importedPropertyManagers
        .map((item) => item.id)
        .filter((value): value is string => Boolean(value)),
    );
    const matchedManagers = new Map<string, OperationPanelProps["data"]["propertyManagers"][number]>();
    const unresolvedNames = new Set<string>();

    for (const item of data.propertyManagers) {
      if (importedIds.has(item.id)) {
        matchedManagers.set(item.id, item);
      }
    }

    for (const importedManager of selectedUpload.importedPropertyManagers) {
        const normalizedName = cleanPropertyManagerName(importedManager.name).trim().toLowerCase();

      if (!normalizedName || importedManager.id) {
        continue;
      }

      if ((propertyManagerNameCounts.get(normalizedName) ?? 0) !== 1) {
          unresolvedNames.add(cleanPropertyManagerName(importedManager.name).trim());
        continue;
      }

      const match = data.propertyManagers.find(
          (item) => cleanPropertyManagerName(item.name).trim().toLowerCase() === normalizedName,
      );

      if (match) {
        matchedManagers.set(match.id, match);
      }
    }

    const matchedList = Array.from(matchedManagers.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    return {
      matchedManagers: matchedList,
      matchedIds: matchedList.map((item) => item.id),
      unresolvedNames: Array.from(unresolvedNames).sort((left, right) => left.localeCompare(right)),
    };
  }, [data.propertyManagers, propertyManagerNameCounts, selectedUpload]);

  const importedManagerIdsForUpload = useMemo(
    () => importedManagerSelection.matchedIds,
    [importedManagerSelection],
  );

  const importedManagerIdsForUploadSet = useMemo(
    () => new Set(importedManagerIdsForUpload),
    [importedManagerIdsForUpload],
  );

  async function handleWhatsAppCopy(target: string, managerName?: string) {
    const existingMessage =
      target === "global"
        ? whatsAppExport?.combinedText
        : whatsAppExport?.managerMessages.find((item) => item.propertyManagerId === target)?.text;

    if (existingMessage) {
      await copyText(
        target === "global"
          ? isEnglish
            ? "General WhatsApp message"
            : "Mensagem geral do WhatsApp"
          : isEnglish
            ? `Message from ${managerName ?? "property manager"}`
            : `Mensagem de ${managerName ?? "gerente de propriedades"}`,
        existingMessage,
      );
      return;
    }

    const payload = await refreshWhatsAppExport(target);
    const fetchedMessage =
      target === "global" ? payload?.combinedText : payload?.managerMessages[0]?.text;

    if (fetchedMessage) {
      await copyText(
        target === "global"
          ? isEnglish
            ? "General WhatsApp message"
            : "Mensagem geral do WhatsApp"
          : isEnglish
            ? `Message from ${managerName ?? "property manager"}`
            : `Mensagem de ${managerName ?? "gerente de propriedades"}`,
        fetchedMessage,
      );
    }
  }

  useEffect(() => {
    if (!selectedUpload) {
      return;
    }

    setForm((current) => {
      if (hasManualSelectionChanges) {
        return current;
      }

      if (
        latestOperationRun &&
        latestOperationRun.spreadsheetUpload.id === selectedUpload.id
      ) {
        return {
          ...current,
          availablePropertyManagerIds: latestOperationRun.availablePMs.map(
            (item) => item.propertyManagerId,
          ),
          preventMixedCondominiumOffices: latestOperationRun.preventMixedCondominiumOffices,
          forceEqualCheckins: false,
          temporaryOfficeByManagerId: Object.fromEntries(
            latestOperationRun.availablePMs
              .filter((item) => item.temporaryOfficeId)
              .map((item) => [item.propertyManagerId, item.temporaryOfficeId!]),
          ),
        };
      }

      return {
        ...current,
        availablePropertyManagerIds: importedManagerIdsForUpload,
      };
    });
  }, [
    hasManualSelectionChanges,
    importedManagerIdsForUpload,
    latestOperationRun,
    selectedUpload,
  ]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      temporaryOfficeByManagerId: Object.fromEntries(
        Object.entries(current.temporaryOfficeByManagerId).filter(([managerId]) =>
          current.availablePropertyManagerIds.includes(managerId),
        ),
      ),
    }));
  }, [form.availablePropertyManagerIds]);

  useEffect(() => {
    if (!message && !error && !copyState) return;
    const timeout = window.setTimeout(() => {
      setMessage("");
      setError("");
      setCopyState("");
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [message, error, copyState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedMessage = window.sessionStorage.getItem("operation-panel-persistent-success-message");
    if (!storedMessage) {
      return;
    }

    setPersistentSuccessMessage(storedMessage);
    window.sessionStorage.removeItem("operation-panel-persistent-success-message");
  }, []);

  const groupedAssignments = useMemo(() => {
    const map = new Map<
      string,
      {
        manager: NonNullable<OperationPanelProps["data"]["latestOperationRun"]>["assignments"][number]["propertyManager"];
        assignments: NonNullable<OperationPanelProps["data"]["latestOperationRun"]>["assignments"];
      }
    >();

    for (const assignment of latestOperationRun?.assignments ?? []) {
      const existing = map.get(assignment.propertyManager.id);

      if (existing) {
        existing.assignments.push(assignment);
      } else {
        map.set(assignment.propertyManager.id, {
          manager: assignment.propertyManager,
          assignments: [assignment],
        });
      }
    }

    return Array.from(map.values()).sort((left, right) =>
      cleanPropertyManagerName(left.manager.name).localeCompare(
        cleanPropertyManagerName(right.manager.name),
      ),
    );
  }, [latestOperationRun]);

  const whatsAppMessagesByManager = useMemo(
    () =>
      new Map(
        whatsAppExport?.managerMessages.map((messageItem) => [
          messageItem.propertyManagerId,
          messageItem,
        ]) ?? [],
      ),
    [whatsAppExport],
  );

  const analysisByManager = useMemo(
    () =>
      new Map(
        analysis?.managers.map((manager) => [manager.propertyManagerId, manager]) ?? [],
      ),
    [analysis],
  );

  const displayedAnalysis = useMemo(() => {
    if (analysis) {
      return analysis;
    }

    if (!latestOperationRun) {
      return null;
    }

    if (mode === "route" && !analysisError) {
      return null;
    }

    return buildFallbackRouteAnalysis(
      latestOperationRun,
      data.propertyManagers,
      isEnglish,
      latestOperationTemporaryOfficeMap,
    );
  }, [analysis, analysisError, data.propertyManagers, isEnglish, latestOperationRun, latestOperationTemporaryOfficeMap, mode]);

  useEffect(() => {
    const activeUploadId = data.activeUpload?.id;

    if (!activeUploadId) {
      return;
    }

    setForm((current) =>
      current.spreadsheetUploadId === activeUploadId
        ? current
        : {
            ...current,
            spreadsheetUploadId: activeUploadId,
          },
    );
    setHasManualSelectionChanges(false);
  }, [data.activeUpload?.id]);

  function handleAction(action: () => Promise<void>, successMessage: string) {
    startTransition(async () => {
      try {
        await action();
        setMessage(successMessage);
        setError("");
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : isEnglish
              ? "The operation failed."
              : "A operação falhou.",
        );
      }
    });
  }

  const refreshRouteIntelligence = useCallback(async () => {
    setAnalysisError("");

    try {
      const payload = await fetchRouteAnalysis();
      setAnalysis(payload.analysis);
    } catch (fetchError) {
      setAnalysisError(
        fetchError instanceof Error
          ? fetchError.message
          : isEnglish
            ? "Could not load the analysis."
            : "Não foi possível carregar a análise.",
      );
    }
  }, [isEnglish]);

  const refreshWhatsAppExport = useCallback(async (target: string = "global") => {
    setWhatsAppPendingTarget(target);
    setWhatsAppError("");

    try {
      const propertyManagerId = target === "global" ? undefined : target;
      const payload = await fetchWhatsAppExport(propertyManagerId);

      if (propertyManagerId) {
        const nextMessage = payload.managerMessages[0] ?? null;

        setWhatsAppExport((current) => ({
          combinedText: current?.combinedText ?? payload.combinedText,
          managerMessages: nextMessage
            ? [
                ...(current?.managerMessages ?? []).filter(
                  (item) => item.propertyManagerId !== propertyManagerId,
                ),
                nextMessage,
              ].sort((left, right) => left.managerName.localeCompare(right.managerName))
            : (current?.managerMessages ?? []),
        }));

        return payload;
      }

      setWhatsAppExport({
        combinedText: payload.combinedText,
        managerMessages: payload.managerMessages,
      });

      return payload;
    } catch (fetchError) {
      setWhatsAppError(
        fetchError instanceof Error
          ? fetchError.message
          : isEnglish
            ? "Could not prepare the message."
            : "Não foi possível montar a mensagem.",
      );
      return null;
    } finally {
      setWhatsAppPendingTarget(null);
    }
  }, [isEnglish]);

  async function handlePdfDownload(target: string) {
    setPdfPendingTarget(target);
    setError("");

    try {
      await downloadLatestOperationPdf(locale, target === "global" ? undefined : target);
      setMessage(isEnglish ? "PDF generated successfully." : "PDF gerado com sucesso.");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : isEnglish
            ? "Could not download the PDF."
            : "Não foi possível baixar o PDF.",
      );
    } finally {
      setPdfPendingTarget(null);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(isEnglish ? `${label} copied.` : `${label} copiado.`);
    } catch {
      setError(isEnglish ? "Could not copy the text." : "Não foi possível copiar o texto.");
    }
  }

  const handleRebuildOperation = useCallback(async (useHereRouting = false) => {
    setRebuildTarget(useHereRouting ? "here" : "local");
    setAnalysisError("");
    setError("");
    setMessage("");

    try {
      await rebuildLatestOperation(useHereRouting);
      setAnalysis(null);
      setWhatsAppExport(null);
      router.refresh();
      setMessage(
        useHereRouting
          ? isEnglish
            ? "Operation recalculated with HERE API."
            : "Operação recalculada com a API HERE."
          : isEnglish
            ? "Operation recalculated successfully."
            : "Operação recalculada com sucesso.",
      );
    } catch (rebuildError) {
      setError(
        rebuildError instanceof Error
          ? rebuildError.message
          : isEnglish
            ? "Could not recalculate the operation."
            : "Não foi possível recalcular a operação.",
      );
    } finally {
      setRebuildTarget(null);
    }
  }, [isEnglish, router]);

  useEffect(() => {
    if (mode !== "route" || !latestOperationRun?.id) {
      return;
    }

    void refreshRouteIntelligence();
    void refreshWhatsAppExport("global");
  }, [latestOperationRun?.id, mode, refreshRouteIntelligence, refreshWhatsAppExport]);

  function renderViewportOverlay(content: React.ReactNode) {
    if (typeof document === "undefined") {
      return null;
    }

    return createPortal(content, document.body);
  }

  return (
    <div className="space-y-6">
      {operationPending
        ? renderViewportOverlay(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 px-6 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/95 p-6 text-center shadow-2xl shadow-cyan-950/30">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-cyan-300" />
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {isEnglish ? "Running operation" : "Rodando operação"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {isEnglish
                    ? "We are distributing check-ins, preparing the routes, and updating the final reading."
                    : "Estamos distribuindo os check-ins, preparando as rotas e atualizando a leitura final."}
                </p>
              </div>
            </div>,
          )
        : null}
      {!shouldHideSuccessModal && persistentSuccessMessage
        ? renderViewportOverlay(
            <div className="fixed inset-0 z-[121] flex items-center justify-center bg-slate-950/62 px-6 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[1.75rem] border border-emerald-300/20 bg-slate-950/96 p-6 text-center shadow-2xl shadow-emerald-950/30">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-2xl text-emerald-200">
                  ✓
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {isEnglish ? "Operation completed" : "Operação concluída"}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{persistentSuccessMessage}</p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setPersistentSuccessMessage("")}
                    className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>,
          )
        : null}
      {mode !== "route" ? (
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            {isEnglish ? "Operational decision" : "Decisão operacional"}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">
            {isEnglish ? "Property Managers available today" : "Gerentes de Propriedades disponíveis no dia"}
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            {isEnglish ? "Choose who is available for this operation and assemble the check-in separation." : "Escolha quem está disponível para esta operação e monte a separação dos check-ins."}
          </p>
          <form
            className="mt-5 space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              setOperationPending(true);
              try {
                setMessage("");
                setPersistentSuccessMessage("");
                setError("");
                setAnalysisError("");
                setAnalysis(null);
                setWhatsAppExport(null);
                await runOperation({
                  spreadsheetUploadId: form.spreadsheetUploadId,
                  decisionMode: form.decisionMode === "override" ? "override" : "default",
                  availablePropertyManagerIds: form.availablePropertyManagerIds,
                  preventMixedCondominiumOffices: form.preventMixedCondominiumOffices,
                  forceEqualCheckins: form.forceEqualCheckins,
                  temporaryOfficeByManagerId: form.temporaryOfficeByManagerId,
                });
                const payload = await fetchRouteAnalysis(true);
                setAnalysis(payload.analysis);
                const successMessage = isEnglish
                  ? "Operation completed successfully."
                  : "Operação rodada com sucesso.";
                setPersistentSuccessMessage(successMessage);
                persistFlashMessage(successMessage);
                router.refresh();
              } catch (actionError) {
                setError(
                  actionError instanceof Error
                    ? actionError.message
                    : isEnglish
                      ? "The operation failed."
                      : "A operação falhou.",
                );
              } finally {
                setOperationPending(false);
              }
            }}
          >
            <div className="grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">
                  {isEnglish ? "Base upload" : "Upload base"}
                </span>
                <select
                  value={form.spreadsheetUploadId}
                  onChange={(event) => {
                    setHasManualSelectionChanges(false);
                    setForm((current) => ({
                      ...current,
                      spreadsheetUploadId: event.target.value,
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="">{isEnglish ? "Select an upload" : "Selecione um upload"}</option>
                  {data.uploadHistory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatUploadLabel(item)} | {formatPanelDateOnly(item.operationDate)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!selectedUpload ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {isEnglish ? "No active upload selected. Choose a file on this screen or activate a base in the" : "Nenhum upload ativo selecionado. Escolha um arquivo nesta tela ou ative uma base na aba"}{" "}
                <span className="font-medium text-white">
                  {isEnglish ? "History" : "Histórico"}
                </span>.
              </div>
            ) : null}

            <div>
              <p className="mb-3 text-sm font-medium text-slate-200">
                {isEnglish ? "Property Managers available today" : "Gerentes de Propriedades disponíveis no dia"}
              </p>
              <div className="mb-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setHasManualSelectionChanges(true);
                    setForm((current) => ({
                      ...current,
                      availablePropertyManagerIds: allPropertyManagersSorted.map((item) => item.id),
                    }));
                  }}
                  className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200"
                >
                  {isEnglish ? "Select all" : "Selecionar todos"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHasManualSelectionChanges(true);
                    setForm((current) => ({
                      ...current,
                      availablePropertyManagerIds: [],
                    }));
                  }}
                  className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200"
                >
                  {isEnglish ? "Clear selection" : "Tirar seleção"}
                </button>
              </div>
              <p className="mb-3 text-xs leading-5 text-slate-400">
                {isEnglish
                  ? "The list below shows all registered property managers. The names found in the spreadsheet are pre-selected for this operation."
                  : "A lista abaixo mostra todos os gerentes de propriedades cadastrados. Os nomes encontrados na planilha ficam pré-selecionados para esta operação."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {allPropertyManagersSorted.map((item) => (
                  <label
                    key={item.id}
                    className={`flex min-h-[4.3rem] items-start gap-3 rounded-2xl border px-4 py-2.5 text-sm transition ${
                      importedManagerIdsForUploadSet.has(item.id)
                        ? "border-cyan-300/30 bg-cyan-300/10 text-slate-100"
                        : "border-white/10 bg-white/5 text-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.availablePropertyManagerIds.includes(item.id)}
                      onChange={(event) => {
                        setHasManualSelectionChanges(true);
                        setForm((current) => ({
                          ...current,
                          availablePropertyManagerIds: event.target.checked
                            ? [...current.availablePropertyManagerIds, item.id]
                            : current.availablePropertyManagerIds.filter(
                                (value) => value !== item.id,
                              ),
                        }));
                      }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span>
                        {cleanPropertyManagerName(item.name)}
                        {!item.isActive ? isEnglish ? " (inactive)" : " (inativo)" : ""}
                        {item.office ? ` | ${item.office.name}` : ""}
                        {importedManagerIdsForUploadSet.has(item.id) ? isEnglish ? " | in spreadsheet" : " | na planilha" : ""}
                      </span>
                      <div
                        className={`flex min-h-[1.2rem] flex-wrap items-center gap-2 text-xs ${
                          form.availablePropertyManagerIds.includes(item.id)
                            ? "text-slate-300"
                            : "pointer-events-none opacity-0"
                        }`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span>{isEnglish ? "Office of the day" : "Office do dia"}:</span>
                        <select
                          value={form.temporaryOfficeByManagerId[item.id] ?? ""}
                          onChange={(event) => {
                            setHasManualSelectionChanges(true);
                            setForm((current) => ({
                              ...current,
                              temporaryOfficeByManagerId: {
                                ...current.temporaryOfficeByManagerId,
                                [item.id]: event.target.value,
                              },
                            }));
                          }}
                          disabled={!form.availablePropertyManagerIds.includes(item.id)}
                          className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-0"
                        >
                          <option value="">
                            {isEnglish ? "Base office" : "Escritório base"}
                          </option>
                          {data.offices.map((office) => (
                            <option key={office.id} value={office.id}>
                              {office.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {importedManagerSelection.matchedManagers.length === 0 ? (
                <p className="mt-3 text-sm text-amber-200">
                  {isEnglish
                    ? "This file did not include identified property managers to select at this stage."
                    : "Este arquivo não trouxe gerentes de propriedades identificados para selecionar nesta etapa."}
                </p>
              ) : null}
              {importedManagerSelection.unresolvedNames.length > 0 ? (
                <p className="mt-3 text-sm text-amber-200">
                  {isEnglish
                    ? `Some property managers from the spreadsheet were not automatically pre-selected because the name appears more than once in the database: ${importedManagerSelection.unresolvedNames.join(", ")}.`
                    : `Alguns gerentes de propriedades da planilha não foram pré-selecionados automaticamente porque o nome aparece mais de uma vez na base: ${importedManagerSelection.unresolvedNames.join(", ")}.`}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col items-start gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={form.preventMixedCondominiumOffices}
                    onChange={(event) => {
                      setHasManualSelectionChanges(true);
                      setForm((current) => ({
                        ...current,
                        preventMixedCondominiumOffices: event.target.checked,
                      }));
                    }}
                  />
                  <span>
                    {isEnglish ? "Do not merge condominiums" : "Não mesclar condomínios"}
                  </span>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={form.forceEqualCheckins}
                    onChange={(event) => {
                      setHasManualSelectionChanges(true);
                      setForm((current) => ({
                        ...current,
                        forceEqualCheckins: event.target.checked,
                      }));
                    }}
                  />
                  <span>
                    {isEnglish ? "Force equal check-ins" : "Forçar igualar check-ins"}
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={pending || operationPending || !form.spreadsheetUploadId}
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
                >
                  {isEnglish ? "Run operation" : "Rodar operação"}
                </button>
                {mode === "availability" && data.latestOperationRun && onOpenRouteTab ? (
                  <button
                    type="button"
                    onClick={onOpenRouteTab}
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-slate-200"
                  >
                    {isEnglish ? "View best route" : "Ver melhor rota"}
                  </button>
                ) : null}
              </div>
            </div>
            {message ? <p className="text-sm text-emerald-200">{message}</p> : null}
            {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          </form>
        </section>
      ) : null}

      {mode !== "availability" ? (
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{isEnglish ? "Best route" : "Melhor rota"}</p>
              <h3 className="mt-3 text-xl font-semibold text-white">{isEnglish ? "Operation finalization" : "Finalização da operação"}</h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                {isEnglish
                  ? "Review the final route here with a visual score, live map, AI reading, and output ready for PDF and WhatsApp."
                  : "Aqui você revisa a rota final com score visual, mapa ao vivo, leitura de IA e saída pronta para PDF e WhatsApp."}
              </p>
            </div>
            {latestOperationRun ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleRebuildOperation(false)}
                  disabled={rebuildTarget !== null}
                  className="min-w-[15rem] rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition disabled:cursor-not-allowed disabled:border-cyan-300/20 disabled:bg-cyan-300/10 disabled:text-white disabled:opacity-100"
                >
                  {rebuildTarget === "local"
                    ? (
                        <ActionLoadingLabel
                          primary={isEnglish ? "Recalculating route" : "Recalculando rota"}
                          secondary={isEnglish ? "Optimizing distribution" : "Otimizando distribuição"}
                        />
                      )
                    : isEnglish
                      ? "Recalculate route and distribution"
                      : "Recalcular rota e distribuição"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRebuildOperation(true)}
                  disabled={rebuildTarget !== null}
                  className="min-w-[12rem] rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200 transition disabled:cursor-not-allowed disabled:border-cyan-300/20 disabled:bg-cyan-300/10 disabled:text-white disabled:opacity-100"
                >
                  {rebuildTarget === "here"
                    ? (
                        <ActionLoadingLabel
                          primary={isEnglish ? "Using HERE API" : "Usando API HERE"}
                          secondary={isEnglish ? "Calculating live route" : "Calculando rota em tempo real"}
                        />
                      )
                    : isEnglish
                      ? "Use API"
                      : "Usar API"}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePdfDownload("global")}
                  disabled={pdfPendingTarget === "global"}
                  className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-slate-700 disabled:text-slate-300 disabled:opacity-100"
                >
                  {pdfPendingTarget === "global" ? (isEnglish ? "Generating PDF..." : "Gerando PDF...") : isEnglish ? "Generate printable PDF" : "Gerar PDF geral"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    whatsAppExport
                      ? void handleWhatsAppCopy("global")
                      : void refreshWhatsAppExport("global")
                  }
                  disabled={whatsAppPendingTarget === "global"}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200"
                >
                  {whatsAppPendingTarget === "global" ? (isEnglish ? "Preparing WhatsApp..." : "Montando WhatsApp...") : isEnglish ? "Copy general WhatsApp" : "Copiar WhatsApp geral"}
                </button>
              </div>
            ) : null}
          </div>

          {latestOperationRun ? (
            <>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "File" : "Arquivo"}</p>
                  <p className="mt-2 text-sm text-white">
                    {formatUploadLabel(latestOperationRun.spreadsheetUpload)}
                  </p>
                </div>
                <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {isEnglish ? "Operation" : "Operação"}
                  </p>
                  <p className="mt-2 text-sm text-white">
                    {formatPanelDateOnly(latestOperationRun.operationDate)}
                  </p>
                </div>
                <div className="content-safe rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Generated" : "Gerado"}</p>
                  <p className="mt-2 text-sm text-white">
                    {formatPanelDateTime(latestOperationRun.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan-400/20 bg-slate-950/80">
                      <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Score</p>
                        <p className={`text-3xl font-semibold ${getScoreStyle(displayedAnalysis?.overallScore ?? 0).text}`}>
                          {displayedAnalysis?.overallScore ?? "--"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-slate-300">
                        {displayedAnalysis?.overallSummary ?? (isEnglish ? "Route AI is still loading. In the meantime, the local heuristic remains valid." : "A IA da rota ainda está carregando. Enquanto isso, a heurística local continua válida.")}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {isEnglish ? "Source" : "Fonte"}: {displayedAnalysis?.source === "openai" ? "OpenAI" : isEnglish ? "Local AI" : "IA local"}
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {isEnglish ? "Coordinates" : "Coordenadas"}: {displayedAnalysis?.coordinateCoveragePercent ?? 0}%
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {isEnglish ? "Estimated distance" : "Distância estimada"}: {displayedAnalysis?.totalEstimatedDistanceKm ?? 0} mi
                        </span>
                      </div>
                    </div>
                  </div>
                  {analysisError ? <p className="mt-4 text-sm text-rose-200">{analysisError}</p> : null}
                  {copyState ? <p className="mt-4 text-sm text-emerald-200">{copyState}</p> : null}
                  {whatsAppError ? <p className="mt-4 text-sm text-rose-200">{whatsAppError}</p> : null}
                  {displayedAnalysis?.managers?.length ? (
                    <RouteOverviewMap managers={displayedAnalysis.managers} />
                  ) : null}
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{isEnglish ? "Final checklist" : "Checklist final"}</p>
                  <div className="mt-4 space-y-3">
                    {(displayedAnalysis?.routeHighlights ?? []).map((highlight) => (
                      <div
                        key={highlight}
                        className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100"
                      >
                        {highlight}
                      </div>
                    ))}
                    {(displayedAnalysis?.routeRisks ?? []).map((risk) => (
                      <div
                        key={risk}
                        className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"
                      >
                        {risk}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-cyan-400/15 bg-cyan-400/5 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                      {isEnglish ? "Final exports" : "Exportações finais"}
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-white">{isEnglish ? "Printable PDF and message for sending" : "PDF para imprimir e mensagem para envio"}</h4>
                    <p className="mt-2 text-sm text-slate-300">
                      {isEnglish ? "Use these buttons to generate the final output of the operation. The PDF opens ready to download or print." : "Use estes botões para gerar a saída final da operação. O PDF abre pronto para baixar ou imprimir."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePdfDownload("global")}
                      disabled={pdfPendingTarget === "global"}
                      className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-slate-700 disabled:text-slate-300 disabled:opacity-100"
                    >
                      {pdfPendingTarget === "global" ? (isEnglish ? "Generating PDF..." : "Gerando PDF...") : isEnglish ? "Generate printable PDF" : "Gerar PDF para imprimir"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        whatsAppExport
                          ? void handleWhatsAppCopy("global")
                          : void refreshWhatsAppExport("global")
                      }
                      disabled={whatsAppPendingTarget === "global"}
                      className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:border-white/6 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-100"
                    >
                      {whatsAppPendingTarget === "global" ? (isEnglish ? "Preparing message..." : "Montando mensagem...") : isEnglish ? "Copy general message" : "Copiar mensagem geral"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {groupedAssignments.map(({ manager, assignments }) => {
                  const managerAnalysis = analysisByManager.get(manager.id) ??
                    displayedAnalysis?.managers.find((item) => item.propertyManagerId === manager.id);
                  const managerWhatsApp = whatsAppMessagesByManager.get(manager.id);
                  const scoreStyle = getScoreStyle(managerAnalysis?.routeScore ?? 0);
                  const effectiveOffice = getEffectiveManagerOffice(manager);
                  const isolatedStops = analyzeIsolatedStops(assignments, effectiveOffice);
                  const isExpanded = expandedStopManagers.includes(manager.id);
                  const totalWorkload = assignments.reduce(
                    (total, assignment) => total + assignment.workload,
                    0,
                  );
                  const withCoordinates = assignments.filter(
                    (assignment) => assignment.checkin.lat != null && assignment.checkin.lng != null,
                  ).length;
                  const withoutCoordinates = assignments.length - withCoordinates;
                  const uniqueResorts = Array.from(
                    new Set(
                      assignments
                        .map((assignment) => assignment.checkin.condominiumName)
                        .filter((value): value is string => Boolean(value)),
                    ),
                  ).sort((left, right) => left.localeCompare(right));

                  return (
                    <div
                      key={manager.id}
                      className={`content-safe rounded-[1.5rem] border bg-white/5 p-5 ${scoreStyle.border}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedStopManagers((current) =>
                            current.includes(manager.id)
                              ? current.filter((item) => item !== manager.id)
                              : [...current, manager.id],
                          )
                        }
                        className="flex w-full flex-col gap-4 text-left xl:flex-row xl:items-start xl:justify-between"
                      >
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {cleanPropertyManagerName(manager.name)}
                          </p>
                          <p className="mt-1 text-sm text-slate-300">
                            {isEnglish ? "Route origin" : "Origem da rota"}: {getOfficeAddress(effectiveOffice)}
                          </p>
                          <p className="mt-1 text-sm text-slate-300">
                            {isEnglish ? "Stops" : "Paradas"}: {assignments.length} |{" "}
                            {isEnglish ? "Workload" : "Carga"}: {totalWorkload}
                          </p>
                          <p className="mt-1 text-sm text-slate-300">
                            {isEnglish ? "Phone" : "Telefone"}:{" "}
                            {managerAnalysis?.phone || (isEnglish ? "Not informed" : "Não informado")}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {managerAnalysis?.summary ??
                              (assignments.some(
                                (item) => item.checkin.lat != null && item.checkin.lng != null,
                              )
                                ? (isEnglish
                                  ? "Suggested order with geolocation when available."
                                  : "Ordem sugerida com geolocalização quando disponível.")
                                : (isEnglish
                                  ? "Suggested order by grouping and textual address."
                                  : "Ordem sugerida por agrupamento e endereço textual."))}
                          </p>
                        </div>
                        <div className="content-safe min-w-44 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Route score" : "Score da rota"}</p>
                          <p className={`mt-2 text-3xl font-semibold ${scoreStyle.text}`}>
                            {managerAnalysis?.routeScore ?? "--"}
                          </p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full ${scoreStyle.progress}`}
                              style={{ width: `${managerAnalysis?.routeScore ?? 0}%` }}
                            />
                          </div>
                          <div className="mt-3 space-y-1 text-xs text-slate-400">
                            <p>
                              {isEnglish ? "Estimated distance" : "Distância estimada"}: {managerAnalysis?.estimatedDistanceKm ?? 0} mi
                            </p>
                            <p>
                              {isEnglish ? "Coordinate coverage" : "Cobertura de coordenadas"}: {formatPercent(managerAnalysis?.coordinateCoveragePercent)}
                            </p>
                            <p>{isEnglish ? "Office" : "Escritório"}: {effectiveOffice?.name ?? managerAnalysis?.officeName ?? (isEnglish ? "Not defined" : "Não definido")}</p>
                          </div>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center self-end rounded-full border border-white/10 bg-slate-950/70 text-xl text-slate-300 xl:self-start">
                          {isExpanded ? "−" : "+"}
                        </div>
                      </button>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.8fr_1fr]">
                        <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Resorts" : "Condomínios"}</p>
                          <p className="mt-2 text-sm leading-6 text-white">{uniqueResorts.length}</p>
                          <div className="mt-1 text-xs leading-5 text-slate-400">
                            {uniqueResorts.map((resort) => (
                              <p key={resort} className="break-normal whitespace-normal">
                                {resort}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Coordinates" : "Coordenadas"}</p>
                          <p className="mt-2 text-sm leading-6 text-white">
                            {withCoordinates} {isEnglish ? "with" : "com"} | {withoutCoordinates} {isEnglish ? "without" : "sem"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            {isEnglish ? "Office" : "Escritório"}: {effectiveOffice?.lat != null && effectiveOffice.lng != null ? "ok" : isEnglish ? "without geolocation" : "sem geolocalização"}
                          </p>
                        </div>
                      </div>

                      {isolatedStops.isolatedCount > 0 ? (
                        <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-4 py-3">
                          <p className="text-sm font-medium text-amber-100">
                            {isEnglish ? `Isolated stop alert: ${isolatedStops.isolatedCount} ${isolatedStops.isolatedCount === 1 ? "point seems isolated" : "points seem isolated"} in this route.` : `Alerta de stop isolado: ${isolatedStops.isolatedCount} ${isolatedStops.isolatedCount === 1 ? "ponto parece isolado" : "pontos parecem isolados"} nesta rota.`}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-amber-50/90">
                            {isEnglish ? "Largest estimated jump" : "Maior salto estimado"}: {isolatedStops.worstGapMiles} mi. {isEnglish ? "Examples" : "Exemplos"}: {isolatedStops.labels.join(", ")}.
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <RouteLiveMap
                          title={effectiveOffice?.name ?? managerAnalysis?.officeName ?? cleanPropertyManagerName(manager.name)}
                          points={managerAnalysis?.mapPoints ?? buildFallbackMapPoints(manager, assignments, isEnglish, effectiveOffice)}
                        />
                        <div className="space-y-3">
                          <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                              {isEnglish ? "Route AI" : "IA da rota"}
                            </p>
                            <p className="mt-3 text-sm text-slate-200">
                              {managerAnalysis?.summary ?? (isEnglish ? "No additional AI reading for this property manager." : "Sem leitura de IA adicional para este gerente de propriedades.")}
                            </p>
                            <p className="mt-3 text-xs text-amber-200">
                              {isEnglish ? "Risk" : "Risco"}: {managerAnalysis?.risk ?? (isEnglish ? "Not identified" : "Não identificado")}
                            </p>
                            <p className="mt-2 text-xs text-emerald-200">
                              {isEnglish ? "Adjustment" : "Ajuste"}: {managerAnalysis?.hint ?? (isEnglish ? "No suggested adjustment" : "Sem ajuste sugerido")}
                            </p>
                          </div>
                          <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                              {isEnglish ? "Final output" : "Saída final"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => void handlePdfDownload(manager.id)}
                                disabled={pdfPendingTarget === manager.id}
                                className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-slate-700 disabled:text-slate-300 disabled:opacity-100"
                              >
                                {pdfPendingTarget === manager.id ? (isEnglish ? "Generating PDF..." : "Gerando PDF...") : isEnglish ? "Generate printable PDF" : "Gerar PDF para imprimir"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                    void handleWhatsAppCopy(
                                      manager.id,
                                      cleanPropertyManagerName(manager.name),
                                    )
                                }
                                disabled={whatsAppPendingTarget === manager.id}
                                className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/8"
                              >
                                {whatsAppPendingTarget === manager.id ? (isEnglish ? "Preparing WhatsApp..." : "Montando WhatsApp...") : isEnglish ? "Copy manager WhatsApp" : "Copiar WhatsApp do gerente"}
                              </button>
                              {managerWhatsApp?.phone ? (
                                <a
                                  href={`https://wa.me/${managerWhatsApp.phone.replace(/\D/g, "")}?text=${encodeURIComponent(managerWhatsApp.text)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100"
                                >
                                  {isEnglish ? "Open in WhatsApp" : "Abrir no WhatsApp"}
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStopManagers((current) =>
                              current.includes(manager.id)
                                ? current.filter((item) => item !== manager.id)
                                : [...current, manager.id],
                            )
                          }
                          className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200"
                        >
                          {isExpanded
                            ? isEnglish
                              ? "Hide stop list"
                              : "Ocultar lista de paradas"
                            : isEnglish
                              ? "Show stop list"
                              : "Mostrar lista de paradas"}
                        </button>
                      </div>

                      <div className={isExpanded ? "mt-4 space-y-3" : "hidden"}>
                        {assignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                          >
                            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                                  Stop {assignment.routeOrder}
                                </p>
                                <p className="mt-1 truncate text-sm font-medium text-white">
                                  {assignment.checkin.condominiumName ||
                                    (isEnglish ? "Condominium not informed" : "Condomínio não informado")}
                                </p>
                                <p className="mt-1 truncate text-sm text-slate-300">
                                  {assignment.checkin.address ||
                                  (isEnglish ? "Address not informed" : "Endereço não informado")}
                                </p>
                              </div>
                              <div className="w-full max-w-xs xl:flex-shrink-0">
                                <select
                                  defaultValue={assignment.propertyManager.id}
                                  onChange={(event) =>
                                    handleAction(
                                      () =>
                                        sendJson(`/api/operation-assignments/${assignment.id}`, "PATCH", {
                                          propertyManagerId: event.target.value,
                                        }),
                                      isEnglish ? "Assignment updated successfully." : "Atribuição atualizada com sucesso.",
                                    )
                                  }
                                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-white outline-none"
                                >
                                  {data.propertyManagers
                                    .filter((item) => item.isActive)
                                    .map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {cleanPropertyManagerName(item.name)}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-300">
              {isEnglish
                ? "There is no distribution ready yet. Choose an upload, define the property managers available, and run the operation."
                : "Ainda não existe uma distribuição pronta. Escolha um upload, defina os gerentes de propriedades disponíveis e rode a operação."}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}




