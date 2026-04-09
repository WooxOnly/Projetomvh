"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";

import { useLanguage } from "@/app/language-provider";
import { RouteLiveMap } from "@/app/route-live-map";
import { RouteOverviewMap } from "@/app/route-overview-map";

type OperationPanelProps = {
  mode?: "availability" | "route" | "full";
  onOpenRouteTab?: () => void;
  data: {
    hereApiLockedUntil?: Date | string | null;
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
      endRouteNearOffice: boolean;
      routeAnalysisJson?: string | null;
      routeAnalysisSource?: string | null;
      routeAnalysisModel?: string | null;
      routeAnalysisGeneratedAt?: Date | string | null;
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

function PdfIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 6h26l12 12v34c0 3.314-2.686 6-6 6H16c-3.314 0-6-2.686-6-6V12c0-3.314 2.686-6 6-6Z"
        fill="#FCFCFD"
        stroke="#FF4D4F"
        strokeWidth="2.8"
      />
      <path d="M42 6v12h12" fill="#FFF5F5" stroke="#FF4D4F" strokeWidth="2.8" strokeLinejoin="round" />
      <path
        d="M23.5 16.5c1.6 4.7 4.4 9.4 8.2 13.8 4.2 4.8 8.6 7.8 12.8 9.1"
        stroke="#FF2D2F"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M33.2 17.2c2.3 8-1 17-8 22.4-3.4 2.6-6.7 3.8-9.2 3.7"
        stroke="#FF2D2F"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M28.2 17.4c-3.1 7.7-.6 18.7 6.6 27 3.2 3.7 6.8 6.2 10.1 7.1"
        stroke="#FF2D2F"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <text x="32" y="50" textAnchor="middle" fill="#2B2F38" fontSize="12" fontWeight="800" fontFamily="Arial, sans-serif">
        PDF
      </text>
    </svg>
  );
}

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="10" fill="#FCFCFD" />
      <path
        d="M32 16c-8.8 0-16 7-16 15.6 0 3.1.9 6.1 2.6 8.6L16.5 48l7.9-2.1a16.4 16.4 0 0 0 7.6 1.8c8.8 0 16-7 16-15.6S40.8 16 32 16Z"
        stroke="#22C55E"
        strokeWidth="3.2"
        fill="#F7FFF9"
        strokeLinejoin="round"
      />
      <path
        d="M38.2 37.4c-.5.8-1.1 1.7-2 1.9-.8.2-2 .1-4-.8-1.7-.8-3.1-1.9-4.5-3.3-1.3-1.4-2.5-2.9-3.2-4.4-.8-1.8-.7-3.1-.5-3.9.2-.8 1-1.5 1.7-1.9.3-.2.7-.1 1 .1.4.2 1.4 2.1 1.5 2.4.2.3.1.7-.1 1l-.8 1c-.2.3-.2.7 0 1 .5 1 1.3 2.1 2.5 3.3 1.2 1.1 2.3 2 3.3 2.5.3.1.7.1 1 0l1-.8c.3-.2.7-.3 1-.1.4.2 2.3 1.2 2.5 1.5.2.3.3.7.1 1Z"
        fill="#22C55E"
      />
    </svg>
  );
}

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${className} animate-spin`} aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" opacity="0.22" />
      <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SwapRouteIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 7h9m0 0-2.5-2.5M16 7l-2.5 2.5M17 17H8m0 0 2.5-2.5M8 17l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AdjustRouteIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 7h10m0 0-2.5-2.5M15 7l-2.5 2.5M19 17H9m0 0 2.5-2.5M9 17l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="17" r="1.5" fill="currentColor" />
      <circle cx="18" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

function RouteDetailsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
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

type RouteAdjustmentModalState =
  | {
      type: "swap_full";
      firstPropertyManagerId: string;
      secondPropertyManagerId: string;
    }
  | {
      type: "adjust_between";
      firstPropertyManagerId: string;
      secondPropertyManagerId: string;
    }
  | null;

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

function formatCooldownLabel(lockedUntil: Date | null, isEnglish: boolean) {
  if (!lockedUntil) {
    return isEnglish ? "Use API" : "Usar API";
  }

  const remainingMs = lockedUntil.getTime() - Date.now();
  if (remainingMs <= 0) {
    return isEnglish ? "Use API" : "Usar API";
  }

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return isEnglish ? `Use API (${remainingMinutes}m)` : `Usar API (${remainingMinutes}m)`;
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

function parseStoredRouteAnalysis(
  latestOperationRun: OperationPanelProps["data"]["latestOperationRun"],
) {
  if (!latestOperationRun?.routeAnalysisJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(latestOperationRun.routeAnalysisJson) as RouteAnalysisData;
    if (!parsed.managers?.length) {
      return null;
    }

    return {
      ...parsed,
      source:
        latestOperationRun.routeAnalysisSource === "openai"
          ? "openai"
          : parsed.source ?? "heuristic",
      model: latestOperationRun.routeAnalysisModel ?? parsed.model ?? null,
      generatedAt:
        typeof latestOperationRun.routeAnalysisGeneratedAt === "string"
          ? latestOperationRun.routeAnalysisGeneratedAt
          : latestOperationRun.routeAnalysisGeneratedAt?.toISOString() ?? parsed.generatedAt,
    } satisfies RouteAnalysisData;
  } catch {
    return null;
  }
}

async function rebuildLatestOperation(useHereRouting = false) {
  const response = await fetch("/api/operations/latest/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useHereRouting }),
  });

  return readJsonResponse<{ ok: true; hereRoutingLockedUntil?: string | null }>(response);
}

async function applyLatestRouteAdjustment(body:
  | {
      action: "swap_full";
      firstPropertyManagerId: string;
      secondPropertyManagerId: string;
    }
  | {
      action: "adjust_between";
      firstPropertyManagerId: string;
      secondPropertyManagerId: string;
      assignmentIdsToFirstManager: string[];
      assignmentIdsToSecondManager: string[];
    },
) {
  const response = await fetch("/api/operations/latest/route-adjustments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return readJsonResponse<{ ok: true }>(response);
}

async function runOperation(body: {
  spreadsheetUploadId: string;
  decisionMode: "default" | "override";
  availablePropertyManagerIds: string[];
  preventMixedCondominiumOffices: boolean;
  forceEqualCheckins: boolean;
  endRouteNearOffice: boolean;
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
  const actionButtonClass =
    "inline-flex items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-400/14 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.06),0_10px_30px_rgba(34,211,238,0.08)] transition hover:scale-[1.02] hover:border-cyan-200/70 hover:bg-cyan-300/26 hover:text-white disabled:cursor-not-allowed disabled:border-cyan-300/12 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:hover:scale-100";
  const iconActionButtonClass = `${actionButtonClass} h-14 w-14 sm:h-16 sm:w-16`;
  const topActionButtonClass = `${actionButtonClass} min-h-11 w-full px-5 py-3 text-sm font-medium sm:w-auto`;
  const currentTab = searchParams.get("tab");
  const shouldHideSuccessModal = mode === "route" || currentTab === "route";
  const latestOperationRun = data.latestOperationRun;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [persistentSuccessMessage, setPersistentSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [rebuildTarget, setRebuildTarget] = useState<"local" | "here" | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analysis, setAnalysis] = useState<RouteAnalysisData | null>(() =>
    parseStoredRouteAnalysis(data.latestOperationRun),
  );
  const [hereApiLockedUntil, setHereApiLockedUntil] = useState<Date | null>(
    data.hereApiLockedUntil ? new Date(data.hereApiLockedUntil) : null,
  );
  const [whatsAppPendingTarget, setWhatsAppPendingTarget] = useState<string | null>(null);
  const [pdfPendingTarget, setPdfPendingTarget] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState("");
  const [whatsAppExport, setWhatsAppExport] = useState<WhatsAppExportData | null>(null);
  const [copyState, setCopyState] = useState("");
  const [expandedStopManagers, setExpandedStopManagers] = useState<string[]>([]);
  const [routeAdjustmentModal, setRouteAdjustmentModal] = useState<RouteAdjustmentModalState>(null);
  const [adjustAssignmentsToFirstManager, setAdjustAssignmentsToFirstManager] = useState<string[]>([]);
  const [adjustAssignmentsToSecondManager, setAdjustAssignmentsToSecondManager] = useState<string[]>([]);
  const [operationPending, setOperationPending] = useState(false);
  const [hasJustRunOperation, setHasJustRunOperation] = useState(false);
  const [hasManualSelectionChanges, setHasManualSelectionChanges] = useState(false);
  const [form, setForm] = useState({
    spreadsheetUploadId: data.activeUpload?.id ?? "",
    decisionMode: "default",
    availablePropertyManagerIds: [] as string[],
    preventMixedCondominiumOffices: true,
    forceEqualCheckins: true,
    endRouteNearOffice: true,
    temporaryOfficeByManagerId: {} as Record<string, string>,
  });
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());

  useEffect(() => {
    setHereApiLockedUntil(data.hereApiLockedUntil ? new Date(data.hereApiLockedUntil) : null);
  }, [data.hereApiLockedUntil]);

  useEffect(() => {
    setAnalysis(parseStoredRouteAnalysis(data.latestOperationRun));
  }, [data.latestOperationRun]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCooldownNow(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);
  const normalizedHereApiLockedUntil =
    hereApiLockedUntil && hereApiLockedUntil.getTime() > cooldownNow ? hereApiLockedUntil : null;
  const isHereApiLocked = normalizedHereApiLockedUntil !== null;

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

    return office.address?.trim() || fallback;
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
          forceEqualCheckins: latestOperationRun.forceEqualCheckins,
          endRouteNearOffice: latestOperationRun.endRouteNearOffice,
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

  const groupedAssignmentsByManagerId = useMemo(
    () =>
      new Map(
        groupedAssignments.map((item) => [item.manager.id, item] as const),
      ),
    [groupedAssignments],
  );

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

  const routeAdjustmentFirstManagerGroup = routeAdjustmentModal
    ? groupedAssignmentsByManagerId.get(routeAdjustmentModal.firstPropertyManagerId) ?? null
    : null;
  const routeAdjustmentSecondManagerGroup = routeAdjustmentModal
    ? groupedAssignmentsByManagerId.get(routeAdjustmentModal.secondPropertyManagerId) ?? null
    : null;

  const routeAdjustmentFirstManagerCondominiums = useMemo(() => {
    const grouped = new Map<string, string[]>();

    for (const assignment of routeAdjustmentFirstManagerGroup?.assignments ?? []) {
      const key = assignment.checkin.condominiumName?.trim() || (isEnglish ? "No resort" : "Sem condomínio");
      const existing = grouped.get(key) ?? [];
      existing.push(assignment.id);
      grouped.set(key, existing);
    }

    return Array.from(grouped.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [isEnglish, routeAdjustmentFirstManagerGroup]);

  const routeAdjustmentSecondManagerCondominiums = useMemo(() => {
    const grouped = new Map<string, string[]>();

    for (const assignment of routeAdjustmentSecondManagerGroup?.assignments ?? []) {
      const key = assignment.checkin.condominiumName?.trim() || (isEnglish ? "No resort" : "Sem condomínio");
      const existing = grouped.get(key) ?? [];
      existing.push(assignment.id);
      grouped.set(key, existing);
    }

    return Array.from(grouped.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [isEnglish, routeAdjustmentSecondManagerGroup]);

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

  useEffect(() => {
    if (routeAdjustmentModal?.type !== "adjust_between") {
      setAdjustAssignmentsToFirstManager([]);
      setAdjustAssignmentsToSecondManager([]);
      return;
    }

    setAdjustAssignmentsToFirstManager([]);
    setAdjustAssignmentsToSecondManager([]);
  }, [routeAdjustmentModal]);

  function closeRouteAdjustmentModal() {
    setRouteAdjustmentModal(null);
    setAdjustAssignmentsToFirstManager([]);
    setAdjustAssignmentsToSecondManager([]);
  }

  function openSwapFullModal(firstPropertyManagerId: string) {
    const fallbackSecondManagerId =
      groupedAssignments.find((item) => item.manager.id !== firstPropertyManagerId)?.manager.id ?? "";

    if (!fallbackSecondManagerId) {
      setError(
        isEnglish
          ? "At least two routes are needed to swap a full route."
          : "É preciso ter pelo menos duas rotas para trocar uma rota completa.",
      );
      return;
    }

    setRouteAdjustmentModal({
      type: "swap_full",
      firstPropertyManagerId,
      secondPropertyManagerId: fallbackSecondManagerId,
    });
  }

  function openAdjustBetweenModal(firstPropertyManagerId: string) {
    const fallbackSecondManagerId =
      groupedAssignments.find((item) => item.manager.id !== firstPropertyManagerId)?.manager.id ?? "";

    if (!fallbackSecondManagerId) {
      setError(
        isEnglish
          ? "At least two routes are needed to adjust routes between PMs."
          : "É preciso ter pelo menos duas rotas para ajustar rotas entre PMs.",
      );
      return;
    }

    setRouteAdjustmentModal({
      type: "adjust_between",
      firstPropertyManagerId,
      secondPropertyManagerId: fallbackSecondManagerId,
    });
  }

  function toggleAssignmentSelection(
    assignmentId: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) {
    setter((current) =>
      current.includes(assignmentId)
        ? current.filter((item) => item !== assignmentId)
        : [...current, assignmentId],
    );
  }

  function toggleCondominiumSelection(
    assignmentIds: string[],
    setter: Dispatch<SetStateAction<string[]>>,
  ) {
    setter((current) => {
      const allSelected = assignmentIds.every((assignmentId) => current.includes(assignmentId));

      if (allSelected) {
        return current.filter((item) => !assignmentIds.includes(item));
      }

      return Array.from(new Set([...current, ...assignmentIds]));
    });
  }

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

  function handleRouteAdjustmentSubmit() {
    if (!routeAdjustmentModal) {
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        setError("");
        setAnalysisError("");

        if (routeAdjustmentModal.type === "swap_full") {
          await applyLatestRouteAdjustment({
            action: "swap_full",
            firstPropertyManagerId: routeAdjustmentModal.firstPropertyManagerId,
            secondPropertyManagerId: routeAdjustmentModal.secondPropertyManagerId,
          });
        } else {
          await applyLatestRouteAdjustment({
            action: "adjust_between",
            firstPropertyManagerId: routeAdjustmentModal.firstPropertyManagerId,
            secondPropertyManagerId: routeAdjustmentModal.secondPropertyManagerId,
            assignmentIdsToFirstManager: adjustAssignmentsToFirstManager,
            assignmentIdsToSecondManager: adjustAssignmentsToSecondManager,
          });
        }

        closeRouteAdjustmentModal();
        setAnalysis(null);
        setWhatsAppExport(null);
        setMessage(
          routeAdjustmentModal.type === "swap_full"
            ? isEnglish
              ? "Full route swap applied successfully."
              : "Troca de rota completa aplicada com sucesso."
            : isEnglish
              ? "Route adjustment applied successfully."
              : "Ajuste entre rotas aplicado com sucesso.",
        );
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : isEnglish
              ? "Could not apply the route adjustment."
              : "Não foi possível aplicar o ajuste entre as rotas.",
        );
      }
    });
  }

  const postRebuildRefreshTimeoutsRef = useRef<number[]>([]);

  const clearPostRebuildRefreshes = useCallback(() => {
    for (const timeoutId of postRebuildRefreshTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    postRebuildRefreshTimeoutsRef.current = [];
  }, []);

  const refreshRouteIntelligence = useCallback(async (forceRefresh = false) => {
    setAnalysisError("");

    try {
      const payload = await fetchRouteAnalysis(forceRefresh);
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

  const schedulePostRebuildAnalysisRefreshes = useCallback(() => {
    clearPostRebuildRefreshes();

    postRebuildRefreshTimeoutsRef.current = [6000, 15000, 30000, 60000].map((delayMs) =>
      window.setTimeout(() => {
        void refreshRouteIntelligence(true);
      }, delayMs),
    );
  }, [clearPostRebuildRefreshes, refreshRouteIntelligence]);

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
    if (useHereRouting && isHereApiLocked) {
      setError(
        isEnglish
          ? `HERE API will be available again at ${normalizedHereApiLockedUntil?.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}.`
          : `A API HERE ficará disponível novamente às ${normalizedHereApiLockedUntil?.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}.`,
      );
      return;
    }

    setRebuildTarget(useHereRouting ? "here" : "local");
    setAnalysisError("");
    setError("");
    setMessage("");

    try {
      const payload = await rebuildLatestOperation(useHereRouting);
      if (payload.hereRoutingLockedUntil) {
        setHereApiLockedUntil(new Date(payload.hereRoutingLockedUntil));
      }
      setAnalysis(null);
      setWhatsAppExport(null);
      clearPostRebuildRefreshes();
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
      schedulePostRebuildAnalysisRefreshes();
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
  }, [
    clearPostRebuildRefreshes,
    isEnglish,
    isHereApiLocked,
    normalizedHereApiLockedUntil,
    router,
    schedulePostRebuildAnalysisRefreshes,
  ]);

  useEffect(() => {
    if (mode !== "route" || !latestOperationRun?.id) {
      return;
    }

    const cachedAnalysis = parseStoredRouteAnalysis(latestOperationRun);
    if (!cachedAnalysis) {
      void refreshRouteIntelligence();
    }
    void refreshWhatsAppExport("global");
  }, [
    latestOperationRun,
    latestOperationRun?.id,
    latestOperationRun?.routeAnalysisGeneratedAt,
    mode,
    refreshRouteIntelligence,
    refreshWhatsAppExport,
  ]);

  useEffect(() => {
    return () => {
      clearPostRebuildRefreshes();
    };
  }, [clearPostRebuildRefreshes]);

  function renderViewportOverlay(content: ReactNode) {
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
      {routeAdjustmentModal
        ? renderViewportOverlay(
            <div className="fixed inset-0 z-[122] overflow-y-auto bg-slate-950/72 px-4 py-8 backdrop-blur-sm">
              <div className="mx-auto w-full max-w-6xl rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/96 p-5 shadow-2xl shadow-cyan-950/30 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                      {routeAdjustmentModal.type === "swap_full"
                        ? isEnglish
                          ? "Full route swap"
                          : "Troca de rota completa"
                        : isEnglish
                          ? "Adjust routes between PMs"
                          : "Ajustar rotas entre PMs"}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white sm:text-xl">
                      {routeAdjustmentModal.type === "swap_full"
                        ? isEnglish
                          ? "Swap the entire route between two PMs"
                          : "Trocar a rota inteira entre dois PMs"
                        : isEnglish
                          ? "Move check-ins in batches between two PMs"
                          : "Mover check-ins em lote entre dois PMs"}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                      {routeAdjustmentModal.type === "swap_full"
                        ? isEnglish
                          ? "Use this when the whole route makes more sense with another PM."
                          : "Use esta ação quando a rota inteira fizer mais sentido com outro PM."
                        : isEnglish
                          ? "Select what goes from one PM to the other. You can move only one side or both sides together."
                          : "Selecione o que sai de um PM para o outro. Você pode mover só um lado ou os dois lados juntos."}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-400">
                      {isEnglish ? "PM 1" : "PM 1"}
                    </span>
                    <select
                      value={routeAdjustmentModal.firstPropertyManagerId}
                      onChange={(event) =>
                        setRouteAdjustmentModal((current) =>
                          current
                            ? {
                                ...current,
                                firstPropertyManagerId: event.target.value,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                    >
                      {groupedAssignments.map((item) => (
                        <option key={item.manager.id} value={item.manager.id}>
                          {cleanPropertyManagerName(item.manager.name)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-400">
                      {isEnglish ? "PM 2" : "PM 2"}
                    </span>
                    <select
                      value={routeAdjustmentModal.secondPropertyManagerId}
                      onChange={(event) =>
                        setRouteAdjustmentModal((current) =>
                          current
                            ? {
                                ...current,
                                secondPropertyManagerId: event.target.value,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none"
                    >
                      {groupedAssignments.map((item) => (
                        <option key={item.manager.id} value={item.manager.id}>
                          {cleanPropertyManagerName(item.manager.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {routeAdjustmentModal.type === "swap_full" ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <p className="text-sm font-semibold text-white">
                          {cleanPropertyManagerName(routeAdjustmentFirstManagerGroup?.manager.name ?? "")}
                        </p>
                        <p className="mt-1 text-xs text-slate-300">
                          {isEnglish ? "Current stops" : "Paradas atuais"}: {routeAdjustmentFirstManagerGroup?.assignments.length ?? 0}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <p className="text-sm font-semibold text-white">
                          {cleanPropertyManagerName(routeAdjustmentSecondManagerGroup?.manager.name ?? "")}
                        </p>
                        <p className="mt-1 text-xs text-slate-300">
                          {isEnglish ? "Current stops" : "Paradas atuais"}: {routeAdjustmentSecondManagerGroup?.assignments.length ?? 0}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-300">
                      {isEnglish
                        ? "The full route, route order, score, map, PDF, and WhatsApp output will be recalculated automatically after confirmation."
                        : "A rota completa, a ordem dos stops, o score, o mapa, o PDF e a saída do WhatsApp serão recalculados automaticamente após a confirmação."}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {cleanPropertyManagerName(routeAdjustmentFirstManagerGroup?.manager.name ?? "")}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {routeAdjustmentFirstManagerGroup?.assignments.length ?? 0} {isEnglish ? "current stops" : "paradas atuais"}
                          </p>
                        </div>
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] text-cyan-100">
                          {isEnglish ? "Send to PM 2" : "Enviar para PM 2"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {routeAdjustmentFirstManagerCondominiums.map(([condominiumName, assignmentIds]) => {
                          const allSelected = assignmentIds.every((assignmentId) =>
                            adjustAssignmentsToSecondManager.includes(assignmentId),
                          );

                          return (
                            <button
                              key={condominiumName}
                              type="button"
                              onClick={() =>
                                toggleCondominiumSelection(assignmentIds, setAdjustAssignmentsToSecondManager)
                              }
                              className={`rounded-full border px-3 py-1 text-xs ${
                                allSelected
                                  ? "border-cyan-200 bg-cyan-300/20 text-cyan-50"
                                  : "border-white/10 bg-white/5 text-slate-300"
                              }`}
                            >
                              {condominiumName}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-4 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                        {routeAdjustmentFirstManagerGroup?.assignments.map((assignment) => {
                          const checked = adjustAssignmentsToSecondManager.includes(assignment.id);

                          return (
                            <label
                              key={assignment.id}
                              className={`flex cursor-pointer gap-3 rounded-2xl border px-3 py-3 ${
                                checked
                                  ? "border-cyan-300/40 bg-cyan-300/10"
                                  : "border-white/10 bg-slate-950/60"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleAssignmentSelection(assignment.id, setAdjustAssignmentsToSecondManager)
                                }
                                className="mt-1 h-4 w-4 rounded border-white/10 bg-slate-950/70"
                              />
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">
                                  Stop {assignment.routeOrder}
                                </p>
                                <p className="mt-1 text-sm font-medium text-white">
                                  {assignment.checkin.condominiumName ||
                                    (isEnglish ? "Condominium not informed" : "Condomínio não informado")}
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                  {assignment.checkin.address ||
                                    (isEnglish ? "Address not informed" : "Endereço não informado")}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {cleanPropertyManagerName(routeAdjustmentSecondManagerGroup?.manager.name ?? "")}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {routeAdjustmentSecondManagerGroup?.assignments.length ?? 0} {isEnglish ? "current stops" : "paradas atuais"}
                          </p>
                        </div>
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[11px] text-emerald-100">
                          {isEnglish ? "Send to PM 1" : "Enviar para PM 1"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {routeAdjustmentSecondManagerCondominiums.map(([condominiumName, assignmentIds]) => {
                          const allSelected = assignmentIds.every((assignmentId) =>
                            adjustAssignmentsToFirstManager.includes(assignmentId),
                          );

                          return (
                            <button
                              key={condominiumName}
                              type="button"
                              onClick={() =>
                                toggleCondominiumSelection(assignmentIds, setAdjustAssignmentsToFirstManager)
                              }
                              className={`rounded-full border px-3 py-1 text-xs ${
                                allSelected
                                  ? "border-emerald-200 bg-emerald-300/20 text-emerald-50"
                                  : "border-white/10 bg-white/5 text-slate-300"
                              }`}
                            >
                              {condominiumName}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-4 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                        {routeAdjustmentSecondManagerGroup?.assignments.map((assignment) => {
                          const checked = adjustAssignmentsToFirstManager.includes(assignment.id);

                          return (
                            <label
                              key={assignment.id}
                              className={`flex cursor-pointer gap-3 rounded-2xl border px-3 py-3 ${
                                checked
                                  ? "border-emerald-300/40 bg-emerald-300/10"
                                  : "border-white/10 bg-slate-950/60"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleAssignmentSelection(assignment.id, setAdjustAssignmentsToFirstManager)
                                }
                                className="mt-1 h-4 w-4 rounded border-white/10 bg-slate-950/70"
                              />
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">
                                  Stop {assignment.routeOrder}
                                </p>
                                <p className="mt-1 text-sm font-medium text-white">
                                  {assignment.checkin.condominiumName ||
                                    (isEnglish ? "Condominium not informed" : "Condomínio não informado")}
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                  {assignment.checkin.address ||
                                    (isEnglish ? "Address not informed" : "Endereço não informado")}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {isEnglish ? "Summary" : "Resumo"}
                  </p>
                  {routeAdjustmentModal.type === "swap_full" ? (
                    <div className="mt-2 space-y-1 text-sm text-slate-300">
                      <p>
                        {cleanPropertyManagerName(routeAdjustmentFirstManagerGroup?.manager.name ?? "")}:{" "}
                        {routeAdjustmentFirstManagerGroup?.assignments.length ?? 0} {isEnglish ? "stops" : "paradas"}
                      </p>
                      <p>
                        {cleanPropertyManagerName(routeAdjustmentSecondManagerGroup?.manager.name ?? "")}:{" "}
                        {routeAdjustmentSecondManagerGroup?.assignments.length ?? 0} {isEnglish ? "stops" : "paradas"}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1 text-sm text-slate-300">
                      <p>
                        {cleanPropertyManagerName(routeAdjustmentFirstManagerGroup?.manager.name ?? "")} -&gt;{" "}
                        {cleanPropertyManagerName(routeAdjustmentSecondManagerGroup?.manager.name ?? "")}:{" "}
                        {adjustAssignmentsToSecondManager.length} {isEnglish ? "check-ins selected" : "check-ins selecionados"}
                      </p>
                      <p>
                        {cleanPropertyManagerName(routeAdjustmentSecondManagerGroup?.manager.name ?? "")} -&gt;{" "}
                        {cleanPropertyManagerName(routeAdjustmentFirstManagerGroup?.manager.name ?? "")}:{" "}
                        {adjustAssignmentsToFirstManager.length} {isEnglish ? "check-ins selected" : "check-ins selecionados"}
                      </p>
                      <p>
                        {cleanPropertyManagerName(routeAdjustmentFirstManagerGroup?.manager.name ?? "")}:{" "}
                        {(routeAdjustmentFirstManagerGroup?.assignments.length ?? 0) -
                          adjustAssignmentsToSecondManager.length +
                          adjustAssignmentsToFirstManager.length}{" "}
                        {isEnglish ? "estimated stops after adjustment" : "paradas estimadas após o ajuste"}
                      </p>
                      <p>
                        {cleanPropertyManagerName(routeAdjustmentSecondManagerGroup?.manager.name ?? "")}:{" "}
                        {(routeAdjustmentSecondManagerGroup?.assignments.length ?? 0) -
                          adjustAssignmentsToFirstManager.length +
                          adjustAssignmentsToSecondManager.length}{" "}
                        {isEnglish ? "estimated stops after adjustment" : "paradas estimadas após o ajuste"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeRouteAdjustmentModal}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200"
                  >
                    {isEnglish ? "Cancel" : "Cancelar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRouteAdjustmentSubmit}
                    disabled={
                      pending ||
                      routeAdjustmentModal.firstPropertyManagerId ===
                        routeAdjustmentModal.secondPropertyManagerId ||
                      (routeAdjustmentModal.type === "adjust_between" &&
                        adjustAssignmentsToFirstManager.length === 0 &&
                        adjustAssignmentsToSecondManager.length === 0)
                    }
                    className={topActionButtonClass}
                  >
                    {routeAdjustmentModal.type === "swap_full"
                      ? isEnglish
                        ? "Confirm full route swap"
                        : "Confirmar troca de rota completa"
                      : isEnglish
                        ? "Apply route adjustment"
                        : "Aplicar ajuste entre rotas"}
                  </button>
                </div>
              </div>
            </div>,
          )
        : null}
      {mode !== "route" ? (
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-4 sm:p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            {isEnglish ? "Operational decision" : "Decisão operacional"}
          </p>
          <h3 className="mt-3 text-lg font-semibold text-white sm:text-xl">
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
                  endRouteNearOffice: form.endRouteNearOffice,
                  temporaryOfficeByManagerId: form.temporaryOfficeByManagerId,
                });
                const payload = await fetchRouteAnalysis();
                setAnalysis(payload.analysis);
                const successMessage = isEnglish
                  ? "Operation completed successfully."
                  : "Operação rodada com sucesso.";
                setPersistentSuccessMessage(successMessage);
                persistFlashMessage(successMessage);
                setHasJustRunOperation(true);
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
                    setHasJustRunOperation(false);
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
                    setHasJustRunOperation(false);
                    setForm((current) => ({
                      ...current,
                      availablePropertyManagerIds: allPropertyManagersSorted.map((item) => item.id),
                    }));
                  }}
                  className="min-h-11 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-slate-200"
                >
                  {isEnglish ? "Select all" : "Selecionar todos"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHasManualSelectionChanges(true);
                    setHasJustRunOperation(false);
                    setForm((current) => ({
                      ...current,
                      availablePropertyManagerIds: [],
                    }));
                  }}
                  className="min-h-11 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-slate-200"
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
                    className={`flex min-h-[4.75rem] items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
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
                        setHasJustRunOperation(false);
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
                            setHasJustRunOperation(false);
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

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col items-start gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={form.preventMixedCondominiumOffices}
                    onChange={(event) => {
                      setHasManualSelectionChanges(true);
                      setHasJustRunOperation(false);
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
                      setHasJustRunOperation(false);
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
                <label className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-xs text-slate-100">
                  <input
                    type="checkbox"
                    checked={form.endRouteNearOffice}
                    onChange={(event) => {
                      setHasManualSelectionChanges(true);
                      setHasJustRunOperation(false);
                      setForm((current) => ({
                        ...current,
                        endRouteNearOffice: event.target.checked,
                      }));
                    }}
                  />
                  <span>
                    {isEnglish ? "End route near office" : "Finalizar rota perto do escritório"}
                  </span>
                </label>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                <button
                  type="submit"
                  disabled={pending || operationPending || hasJustRunOperation || !form.spreadsheetUploadId}
                  className={`min-h-11 rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                    hasJustRunOperation
                      ? "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500"
                      : "bg-cyan-300 text-slate-950"
                  }`}
                >
                  {isEnglish ? "Run operation" : "Rodar operação"}
                </button>
                {mode === "availability" && data.latestOperationRun && onOpenRouteTab ? (
                  <button
                    type="button"
                    onClick={onOpenRouteTab}
                    className={`min-h-11 rounded-2xl px-5 py-3 text-sm font-medium transition ${
                      hasJustRunOperation
                        ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30"
                        : "border border-white/10 text-slate-200"
                    }`}
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
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{isEnglish ? "Best route" : "Melhor rota"}</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{isEnglish ? "Operation finalization" : "Finalização da operação"}</h3>
              <p className="mt-1 max-w-2xl text-xs text-slate-300">
                {isEnglish
                  ? "Review the final route here with a visual score, live map, AI reading, and output ready for PDF and WhatsApp."
                  : "Aqui você revisa a rota final com score visual, mapa ao vivo, leitura de IA e saída pronta para PDF e WhatsApp."}
              </p>
            </div>
            {latestOperationRun ? (
              <div className="flex flex-col items-start gap-2">
              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleRebuildOperation(false)}
                  disabled={rebuildTarget !== null}
                  className={topActionButtonClass}
                >
                  {rebuildTarget === "local" ? <SpinnerIcon className="mr-2 h-5 w-5" /> : null}
                  <span>{isEnglish ? "Recalculate route" : "Recalcular rota"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRebuildOperation(true)}
                  disabled={rebuildTarget !== null || isHereApiLocked}
                  className={topActionButtonClass}
                  title={
                    isHereApiLocked
                      ? isEnglish
                        ? `HERE API available again at ${normalizedHereApiLockedUntil?.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : `API HERE disponível novamente às ${normalizedHereApiLockedUntil?.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                      : isEnglish
                        ? "Use HERE API"
                        : "Usar API HERE"
                  }
                  aria-label={isEnglish ? "Use HERE API" : "Usar API HERE"}
                >
                  {rebuildTarget === "here" ? <SpinnerIcon className="mr-2 h-5 w-5" /> : null}
                  <span>{formatCooldownLabel(normalizedHereApiLockedUntil, isEnglish)}</span>
                </button>
              </div>
                {isHereApiLocked ? (
                  <p className="text-[11px] text-amber-200">
                    {isEnglish
                      ? `HERE API locked until ${normalizedHereApiLockedUntil?.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}.`
                      : `API HERE bloqueada até ${normalizedHereApiLockedUntil?.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}.`}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {latestOperationRun ? (
            <>
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                <div className="content-safe rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "File" : "Arquivo"}</p>
                  <p className="mt-1 text-sm text-white">
                    {formatUploadLabel(latestOperationRun.spreadsheetUpload)}
                  </p>
                </div>
                <div className="content-safe rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {isEnglish ? "Operation" : "Operação"}
                  </p>
                  <p className="mt-1 text-sm text-white">
                    {formatPanelDateOnly(latestOperationRun.operationDate)}
                  </p>
                </div>
                <div className="content-safe rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Generated" : "Gerado"}</p>
                  <p className="mt-1 text-sm text-white">
                    {formatPanelDateTime(latestOperationRun.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-2 grid gap-2 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/20 bg-slate-950/80">
                      <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Score</p>
                        <p className={`text-xl font-semibold ${getScoreStyle(displayedAnalysis?.overallScore ?? 0).text}`}>
                          {displayedAnalysis?.overallScore ?? "--"}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-slate-300">
                        {displayedAnalysis?.overallSummary ?? (isEnglish ? "Route AI is still loading. In the meantime, the local heuristic remains valid." : "A IA da rota ainda está carregando. Enquanto isso, a heurística local continua válida.")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-300">
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          {isEnglish ? "Source" : "Fonte"}: {displayedAnalysis?.source === "openai" ? "OpenAI" : isEnglish ? "Local AI" : "IA local"}
                        </span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          {isEnglish ? "Coordinates" : "Coordenadas"}: {displayedAnalysis?.coordinateCoveragePercent ?? 0}%
                        </span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          {isEnglish ? "Estimated distance" : "Distância estimada"}: {displayedAnalysis?.totalEstimatedDistanceKm ?? 0} mi
                        </span>
                      </div>
                    </div>
                  </div>
                  {analysisError ? <p className="mt-2 text-xs text-rose-200">{analysisError}</p> : null}
                  {copyState ? <p className="mt-2 text-xs text-emerald-200">{copyState}</p> : null}
                  {whatsAppError ? <p className="mt-2 text-xs text-rose-200">{whatsAppError}</p> : null}
                  {displayedAnalysis?.managers?.length ? (
                    <RouteOverviewMap managers={displayedAnalysis.managers} />
                  ) : null}
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{isEnglish ? "Final checklist" : "Checklist final"}</p>
                  <div className="mt-2 space-y-2">
                    {(displayedAnalysis?.routeHighlights ?? []).map((highlight) => (
                      <div
                        key={highlight}
                        className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100"
                      >
                        {highlight}
                      </div>
                    ))}
                    {(displayedAnalysis?.routeRisks ?? []).map((risk) => (
                      <div
                        key={risk}
                        className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100"
                      >
                        {risk}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-2 rounded-[1.25rem] border border-cyan-400/15 bg-cyan-400/5 p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                      {isEnglish ? "Final exports" : "Exportações finais"}
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-white">{isEnglish ? "Printable PDF and message for sending" : "PDF para imprimir e mensagem para envio"}</h4>
                    <p className="mt-1 text-xs text-slate-300">
                      {isEnglish ? "Use these buttons to generate the final output of the operation. The PDF opens ready to download or print." : "Use estes botões para gerar a saída final da operação. O PDF abre pronto para baixar ou imprimir."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePdfDownload("global")}
                      disabled={pdfPendingTarget === "global"}
                      className={iconActionButtonClass}
                      title={isEnglish ? "Generate printable PDF" : "Gerar PDF para imprimir"}
                      aria-label={isEnglish ? "Generate printable PDF" : "Gerar PDF para imprimir"}
                    >
                      {pdfPendingTarget === "global" ? <SpinnerIcon className="h-10 w-10" /> : <PdfIcon className="h-10 w-10" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        whatsAppExport
                          ? void handleWhatsAppCopy("global")
                          : void refreshWhatsAppExport("global")
                      }
                      disabled={whatsAppPendingTarget === "global"}
                      className={iconActionButtonClass}
                      title={isEnglish ? "Copy to WhatsApp" : "Copiar para WhatsApp"}
                      aria-label={isEnglish ? "Copy to WhatsApp" : "Copiar para WhatsApp"}
                    >
                      {whatsAppPendingTarget === "global" ? <SpinnerIcon className="h-10 w-10" /> : <WhatsAppIcon className="h-10 w-10" />}
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
                  const hasInferredMapPoints = (managerAnalysis?.mapPoints ?? []).some(
                    (point) => point.inferred,
                  );
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
                      className={`content-safe flex h-full flex-col rounded-[1.5rem] border bg-white/5 p-4 sm:p-5 ${scoreStyle.border}`}
                    >
                      <div className="flex flex-col gap-3">
                      <div className="grid w-full gap-2.5 text-left xl:grid-cols-[minmax(0,1fr)_9rem] xl:items-start">
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-base font-semibold text-white">
                              {cleanPropertyManagerName(manager.name)}
                            </p>
                            <p className="mt-1 text-xs text-slate-300">
                              {isEnglish ? "Route origin" : "Origem da rota"}: {getOfficeAddress(effectiveOffice)}
                            </p>
                            <p className="mt-1 text-xs text-slate-300">
                              {isEnglish ? "Stops" : "Paradas"}: {assignments.length}
                            </p>
                            {managerAnalysis?.phone ? (
                              <p className="mt-1 text-xs text-slate-300">
                                {isEnglish ? "Phone" : "Telefone"}: {managerAnalysis.phone}
                              </p>
                            ) : null}
                          </div>
                          <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-2.5">
                            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">
                              {isEnglish ? "Route information" : "Informacoes da rota"}
                            </p>
                            <p className="mt-1 text-[11px] leading-4.5 text-slate-200">
                              {managerAnalysis?.summary ?? (isEnglish ? "No additional AI reading for this property manager." : "Sem leitura de IA adicional para este gerente de propriedades.")}
                            </p>
                            <p className="mt-1.5 text-[10px] leading-4 text-amber-200">
                              {isEnglish ? "Risk" : "Risco"}: {managerAnalysis?.risk ?? (isEnglish ? "Not identified" : "Não identificado")}
                            </p>
                            <p className="mt-1 text-[10px] leading-4 text-emerald-200">
                              {isEnglish ? "Adjustment" : "Ajuste"}: {managerAnalysis?.hint ?? (isEnglish ? "No suggested adjustment" : "Sem ajuste sugerido")}
                            </p>
                            {hasInferredMapPoints ? (
                              <p className="mt-1 text-[9px] leading-3.5 text-slate-400">
                                {isEnglish
                                  ? "Map view includes automatically positioned points while the real coordinate base is still being enriched."
                                  : "A visualização do mapa inclui pontos posicionados automaticamente enquanto a base real de coordenadas ainda está sendo enriquecida."}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/70 p-2.5">
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Route score" : "Score da rota"}</p>
                          <p className={`mt-1 text-[1.65rem] font-semibold leading-none ${scoreStyle.text}`}>
                            {managerAnalysis?.routeScore ?? "--"}
                          </p>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full ${scoreStyle.progress}`}
                              style={{ width: `${managerAnalysis?.routeScore ?? 0}%` }}
                            />
                          </div>
                          <div className="mt-1.5 space-y-1 text-[10px] leading-4 text-slate-400">
                            <p>
                              {isEnglish ? "Estimated distance" : "Distância estimada"}: {managerAnalysis?.estimatedDistanceKm ?? 0} mi
                            </p>
                            <p>
                              {isEnglish ? "Coordinate coverage" : "Cobertura de coordenadas"}: {formatPercent(managerAnalysis?.coordinateCoveragePercent)}
                            </p>
                            <p>{isEnglish ? "Office" : "Escritório"}: {effectiveOffice?.name ?? managerAnalysis?.officeName ?? (isEnglish ? "Not defined" : "Não definido")}</p>
                          </div>
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

                      <div className="mt-3 grid gap-2.5 xl:grid-cols-[1.12fr_0.88fr] xl:items-start">
                        <RouteLiveMap
                          title={effectiveOffice?.name ?? managerAnalysis?.officeName ?? cleanPropertyManagerName(manager.name)}
                          points={managerAnalysis?.mapPoints ?? buildFallbackMapPoints(manager, assignments, isEnglish, effectiveOffice)}
                        />
                        <div className="flex flex-col gap-2.5">
                          <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-2.5">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{isEnglish ? "Resorts" : "Condomínios"}</p>
                            <p className="mt-1 text-sm leading-5 text-white">{uniqueResorts.length}</p>
                            <div className="mt-1 grid gap-x-4 gap-y-1 text-[11px] leading-4 text-slate-400 sm:grid-cols-2">
                              {uniqueResorts.map((resort) => (
                                <p key={resort} className="break-normal whitespace-normal">
                                  {resort}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div className="content-safe rounded-2xl border border-white/10 bg-slate-950/60 p-2.5">
                            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                              {isEnglish ? "Export" : "Exportar"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => void handlePdfDownload(manager.id)}
                                disabled={pdfPendingTarget === manager.id}
                                className={iconActionButtonClass}
                                title={isEnglish ? "Generate printable PDF" : "Gerar PDF para imprimir"}
                                aria-label={isEnglish ? "Generate printable PDF" : "Gerar PDF para imprimir"}
                              >
                                {pdfPendingTarget === manager.id ? <SpinnerIcon className="h-10 w-10" /> : <PdfIcon className="h-10 w-10" />}
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
                                className={iconActionButtonClass}
                                title={isEnglish ? "Copy to WhatsApp" : "Copiar para WhatsApp"}
                                aria-label={isEnglish ? "Copy to WhatsApp" : "Copiar para WhatsApp"}
                              >
                                {whatsAppPendingTarget === manager.id ? <SpinnerIcon className="h-10 w-10" /> : <WhatsAppIcon className="h-10 w-10" />}
                              </button>
                              {managerWhatsApp?.phone ? (
                                <a
                                  href={`https://wa.me/${managerWhatsApp.phone.replace(/\D/g, "")}?text=${encodeURIComponent(managerWhatsApp.text)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={iconActionButtonClass}
                                  title={isEnglish ? "Open in WhatsApp" : "Abrir no WhatsApp"}
                                  aria-label={isEnglish ? "Open in WhatsApp" : "Abrir no WhatsApp"}
                                >
                                  <WhatsAppIcon className="h-10 w-10" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStopManagers((current) =>
                              current.includes(manager.id)
                                ? current.filter((item) => item !== manager.id)
                                : [...current, manager.id],
                            )
                          }
                          className="inline-flex min-h-[3.35rem] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-2 py-2 text-center text-[11px] font-medium leading-4 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_8px_20px_rgba(34,211,238,0.07)] transition hover:border-cyan-200/70 hover:bg-cyan-300/18 hover:text-white sm:min-h-9 sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[13px]"
                        >
                          <RouteDetailsIcon className="h-4 w-4 shrink-0" />
                          <span>
                            {isExpanded
                              ? isEnglish
                                ? "Hide Route Details"
                                : "Ocultar detalhes da rota"
                              : isEnglish
                                ? "Show Route Details"
                                : "Mostrar detalhes da rota"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openSwapFullModal(manager.id)}
                          className="inline-flex min-h-[3.35rem] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-2 py-2 text-center text-[11px] font-medium leading-4 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_8px_20px_rgba(34,211,238,0.07)] transition hover:border-cyan-200/70 hover:bg-cyan-300/18 hover:text-white sm:min-h-9 sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[13px]"
                        >
                          <SwapRouteIcon className="h-4 w-4 shrink-0" />
                          {isEnglish ? "Swap Full Route" : "Trocar rota completa"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAdjustBetweenModal(manager.id)}
                          className="inline-flex min-h-[3.35rem] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-2 py-2 text-center text-[11px] font-medium leading-4 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_8px_20px_rgba(34,211,238,0.07)] transition hover:border-cyan-200/70 hover:bg-cyan-300/18 hover:text-white sm:min-h-9 sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[13px]"
                        >
                          <AdjustRouteIcon className="h-4 w-4 shrink-0" />
                          {isEnglish ? "Adjust Routes Between PMs" : "Ajustar rotas entre PMs"}
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
                                <p className="mt-1 text-sm font-medium text-white">
                                  {assignment.checkin.condominiumName ||
                                    (isEnglish ? "Condominium not informed" : "Condomínio não informado")}
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
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




