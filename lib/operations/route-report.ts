import { isWithinCentralFloridaServiceArea } from "@/lib/geocoding";
import { formatOperationalAddress } from "@/lib/upload/normalize";

type RouteOffice = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  lat: number | null;
  lng: number | null;
} | null;

type RoutePropertyManager = {
  id: string;
  name: string;
  phone: string | null;
  officeId: string | null;
  office: RouteOffice;
};

type RouteAssignment = {
  id: string;
  routeOrder: number;
  workload: number;
  source: string;
  clusterLabel?: string | null;
  propertyManager: {
    id: string;
    name: string;
    officeId: string | null;
    office: RouteOffice;
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
};

export type RouteRunReport = {
  id: string;
  operationDate: Date | string;
  decisionMode: string;
  status: string;
  totalAssignments: number;
  createdAt: Date | string;
  spreadsheetUpload: { id: string; fileName: string };
  assignments: RouteAssignment[];
};

export type RouteDirectoryManager = RoutePropertyManager;

export type RouteMapPoint = {
  label: string;
  shortLabel: string;
  order: number;
  lat: number;
  lng: number;
  isOffice: boolean;
  inferred?: boolean;
};

export type ManagerRouteMetric = {
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
  mapPoints: RouteMapPoint[];
};

export type RouteAnalysis = {
  source: "heuristic" | "openai";
  model: string | null;
  generatedAt: string;
  overallScore: number;
  totalEstimatedDistanceKm: number;
  coordinateCoveragePercent: number;
  overallSummary: string;
  routeHighlights: string[];
  routeRisks: string[];
  managers: ManagerRouteMetric[];
};

export type WhatsAppMessage = {
  propertyManagerId: string;
  managerName: string;
  phone: string | null;
  text: string;
};

export type WhatsAppPayload = {
  combinedText: string;
  managerMessages: WhatsAppMessage[];
};

function cleanPropertyManagerName(name: string | null | undefined) {
  const safeName = (name ?? "").trim();
  return safeName.replace(/^Responsible\s+/i, "").trim() || safeName || "PM sem nome";
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function kmToMiles(value: number) {
  return value * 0.621371;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatOfficeAddress(office: RouteOffice) {
  if (!office) {
    return "Office sem endereco definido";
  }

  return (
    [office.address, office.city, office.state, office.zipCode].filter(Boolean).join(" | ") ||
    "Office sem endereco definido"
  );
}

function getClusterLabel(assignment: RouteAssignment) {
  return assignment.clusterLabel || assignment.checkin.condominiumName || "sem-cluster";
}

export function formatCheckinOperationalAddress(checkin: {
  address: string | null;
  building: string | null;
}) {
  return formatOperationalAddress(checkin.address, checkin.building);
}

function estimateRouteDistanceKm(assignments: RouteAssignment[]) {
  const sortablePoints = assignments
    .filter((assignment) =>
      isWithinCentralFloridaServiceArea({
        lat: assignment.checkin.lat,
        lng: assignment.checkin.lng,
      }),
    )
    .sort((left, right) => left.routeOrder - right.routeOrder);

  if (sortablePoints.length === 0) {
    return 0;
  }

  const office = sortablePoints[0]?.propertyManager.office;
  let totalDistance = 0;
  let previousPoint =
    office?.lat != null && office.lng != null
      ? { lat: office.lat, lng: office.lng }
      : { lat: sortablePoints[0]!.checkin.lat!, lng: sortablePoints[0]!.checkin.lng! };

  for (const assignment of sortablePoints) {
    const currentPoint = {
      lat: assignment.checkin.lat!,
      lng: assignment.checkin.lng!,
    };
    totalDistance += haversineDistanceKm(previousPoint, currentPoint);
    previousPoint = currentPoint;
  }

  return round(kmToMiles(totalDistance));
}

function buildMapPoints(assignments: RouteAssignment[]): RouteMapPoint[] {
  const points: RouteMapPoint[] = [];
  const office = assignments[0]?.propertyManager.office;
  const actualAssignments = assignments
    .filter((assignment) =>
      isWithinCentralFloridaServiceArea({
        lat: assignment.checkin.lat,
        lng: assignment.checkin.lng,
      }),
    )
    .sort((left, right) => left.routeOrder - right.routeOrder);

  const officePoint =
    office && isWithinCentralFloridaServiceArea(office)
      ? {
          lat: office.lat!,
          lng: office.lng!,
        }
      : null;
  const firstActualPoint = actualAssignments[0]
    ? {
        lat: actualAssignments[0].checkin.lat!,
        lng: actualAssignments[0].checkin.lng!,
      }
    : null;
  const anchor = officePoint ?? firstActualPoint ?? { lat: 28.332, lng: -81.4925 };

  points.push({
    label: office?.name ?? "Origem operacional",
    shortLabel: "O",
    order: 0,
    lat: anchor.lat,
    lng: anchor.lng,
    isOffice: true,
    inferred: officePoint == null,
  });

  assignments
    .sort((left, right) => left.routeOrder - right.routeOrder)
    .forEach((assignment, index) => {
      const lat = assignment.checkin.lat;
      const lng = assignment.checkin.lng;
      const inferred = lat == null || lng == null;
      const fallbackRadius = 0.003 + (index % 5) * 0.001;
      const fallbackAngle = ((index * 53) % 360) * (Math.PI / 180);

      points.push({
        label:
          assignment.checkin.propertyName ||
          assignment.checkin.condominiumName ||
          `Stop ${assignment.routeOrder}`,
        shortLabel: String(assignment.routeOrder),
        order: assignment.routeOrder,
        lat:
          lat ??
          anchor.lat + Math.sin(fallbackAngle) * fallbackRadius,
        lng:
          lng ??
          anchor.lng + Math.cos(fallbackAngle) * fallbackRadius,
        isOffice: false,
        inferred,
      });
    });

  return points;
}

function buildManagerSummary(metric: {
  stops: number;
  coordinateCoveragePercent: number;
  estimatedDistanceKm: number;
  clusters: string[];
  officeOriginCoverage: boolean;
}) {
  const coverageLabel =
    metric.coordinateCoveragePercent >= 90
      ? "quase toda a rota possui coordenadas"
      : metric.coordinateCoveragePercent >= 50
        ? "metade ou mais da rota possui coordenadas"
        : "a rota ainda depende bastante de endereco textual";

  const originLabel = metric.officeOriginCoverage
    ? "com office definido como origem"
    : "sem office geolocalizado como origem";

  return `${metric.stops} check-ins, ${originLabel} e ${coverageLabel}. Distancia estimada de ${metric.estimatedDistanceKm} mi.`;
}

function buildManagerRisk(metric: {
  coordinateCoveragePercent: number;
  clusters: string[];
  estimatedDistanceKm: number;
}) {
  if (metric.coordinateCoveragePercent < 50) {
    return "Faltam coordenadas em boa parte dos stops, entao a ordem ainda depende mais de endereco textual.";
  }

  if (metric.clusters.length >= 4) {
    return "A rota esta cobrindo muitos clusters diferentes, o que pode aumentar a dispersao operacional.";
  }

  if (metric.clusters.length >= 3) {
    return "A rota esta misturando resorts demais para um unico PM e pode exigir redistribuicao.";
  }

  if (metric.estimatedDistanceKm > 45) {
    return "A distancia estimada esta alta para um unico PM e pode exigir revisao manual.";
  }

  return "Risco operacional baixo para essa rota na configuracao atual.";
}

function buildManagerHint(metric: {
  coordinateCoveragePercent: number;
  officeOriginCoverage: boolean;
  clusters: string[];
}) {
  if (!metric.officeOriginCoverage) {
    return "Cadastrar lat/lng do office melhora a saida inicial da rota.";
  }

  if (metric.coordinateCoveragePercent < 100) {
    return "Completar lat/lng das propriedades restantes vai melhorar a ordem automatica.";
  }

  if (metric.clusters.length > 2) {
    return "Vale revisar se um dos clusters pode ser movido para outro PM disponivel.";
  }

  return "A rota esta pronta para seguir para PDF e mensagem operacional.";
}

function scoreManagerRoute(metric: {
  stops: number;
  coordinateCoveragePercent: number;
  officeOriginCoverage: boolean;
  estimatedDistanceKm: number;
  clusters: string[];
}) {
  const coverageScore = metric.coordinateCoveragePercent * 0.4;
  const originScore = metric.officeOriginCoverage ? 15 : 4;
  const clusterScore = Math.max(8, 25 - Math.max(0, metric.clusters.length - 1) * 4);
  const distanceScore =
    metric.estimatedDistanceKm === 0
      ? 12
      : Math.max(8, 20 - Math.min(metric.estimatedDistanceKm / 2, 12));

  return Math.max(0, Math.min(100, Math.round(coverageScore + originScore + clusterScore + distanceScore)));
}

export function buildHeuristicRouteAnalysis(
  run: RouteRunReport,
  directoryManagers: RouteDirectoryManager[],
): RouteAnalysis {
  const managersById = new Map(directoryManagers.map((manager) => [manager.id, manager]));
  const assignmentsByManager = new Map<string, RouteAssignment[]>();

  for (const assignment of run.assignments) {
    const existing = assignmentsByManager.get(assignment.propertyManager.id) ?? [];
    existing.push(assignment);
    assignmentsByManager.set(assignment.propertyManager.id, existing);
  }

  const managerMetrics = Array.from(assignmentsByManager.entries())
    .map(([propertyManagerId, assignments]) => {
      const orderedAssignments = [...assignments].sort((left, right) => left.routeOrder - right.routeOrder);
      const directoryManager = managersById.get(propertyManagerId);
      const stops = orderedAssignments.length;
      const workload = orderedAssignments.reduce((total, assignment) => total + assignment.workload, 0);
      const coordinateAssignments = orderedAssignments.filter(
        (assignment) => assignment.checkin.lat != null && assignment.checkin.lng != null,
      ).length;
      const coordinateCoveragePercent = stops === 0 ? 0 : Math.round((coordinateAssignments / stops) * 100);
      const clusters = Array.from(new Set(orderedAssignments.map(getClusterLabel))).sort((left, right) =>
        left.localeCompare(right),
      );
      const office = directoryManager?.office ?? orderedAssignments[0]?.propertyManager.office ?? null;
      const officeOriginCoverage = office?.lat != null && office.lng != null;
      const estimatedDistanceKm = estimateRouteDistanceKm(orderedAssignments);
      const routeScore = scoreManagerRoute({
        stops,
        coordinateCoveragePercent,
        officeOriginCoverage,
        estimatedDistanceKm,
        clusters,
      });

      return {
        propertyManagerId,
        managerName: cleanPropertyManagerName(
          directoryManager?.name ?? orderedAssignments[0]?.propertyManager.name,
        ),
        phone: directoryManager?.phone ?? null,
        officeName: office?.name ?? "Office nao definido",
        officeAddress: formatOfficeAddress(office),
        stops,
        workload,
        routeScore,
        coordinateCoveragePercent,
        officeOriginCoverage,
        estimatedDistanceKm,
        clusters,
        summary: buildManagerSummary({
          stops,
          coordinateCoveragePercent,
          estimatedDistanceKm,
          clusters,
          officeOriginCoverage,
        }),
        risk: buildManagerRisk({
          coordinateCoveragePercent,
          clusters,
          estimatedDistanceKm,
        }),
        hint: buildManagerHint({
          coordinateCoveragePercent,
          officeOriginCoverage,
          clusters,
        }),
        mapPoints: buildMapPoints(orderedAssignments),
      };
    })
    .sort((left, right) => left.managerName.localeCompare(right.managerName));

  const totalDistance = round(
    managerMetrics.reduce((total, manager) => total + manager.estimatedDistanceKm, 0),
  );
  const totalStops = managerMetrics.reduce((total, manager) => total + manager.stops, 0);
  const weightedCoverage = totalStops
    ? Math.round(
        managerMetrics.reduce(
          (total, manager) => total + manager.coordinateCoveragePercent * manager.stops,
          0,
        ) / totalStops,
      )
    : 0;
  const averageStops = managerMetrics.length
    ? managerMetrics.reduce((total, manager) => total + manager.stops, 0) / managerMetrics.length
    : 0;
  const averageWorkload = managerMetrics.length
    ? managerMetrics.reduce((total, manager) => total + manager.workload, 0) / managerMetrics.length
    : 0;
  const stopDeviation = managerMetrics.length
    ? managerMetrics.reduce((total, manager) => total + Math.abs(manager.stops - averageStops), 0) /
      managerMetrics.length
    : 0;
  const workloadDeviation = managerMetrics.length
    ? managerMetrics.reduce((total, manager) => total + Math.abs(manager.workload - averageWorkload), 0) /
      managerMetrics.length
    : 0;
  const averageRouteScore = managerMetrics.length
    ? managerMetrics.reduce((total, manager) => total + manager.routeScore, 0) / managerMetrics.length
    : 0;
  const balanceAdjustment = Math.max(0, 12 - stopDeviation * 3 - workloadDeviation * 1.5);
  const overallScore = Math.max(0, Math.min(100, Math.round(averageRouteScore * 0.85 + balanceAdjustment)));

  const routeHighlights = [
    `${run.totalAssignments} check-ins distribuidos em ${managerMetrics.length} PMs.`,
    `${weightedCoverage}% dos stops possuem coordenadas suficientes para ordenar a rota automaticamente.`,
    `${managerMetrics.filter((manager) => manager.officeOriginCoverage).length} PMs saem de offices com origem geolocalizada.`,
  ];

  const routeRisks = [
    weightedCoverage < 80
      ? "Ainda faltam coordenadas em parte da base, entao a ordem da rota pode exigir ajuste manual."
      : "A base geolocalizada esta consistente para o uso local atual.",
    stopDeviation > 1.5
      ? "A distribuicao por quantidade ainda esta desequilibrada entre alguns PMs."
      : "A distribuicao por quantidade esta visualmente equilibrada.",
    workloadDeviation > 2
      ? "O workload por quartos ainda tem espaco para refinamento."
      : "O workload por quartos esta dentro de uma faixa aceitavel para o MVP.",
  ];

  return {
    source: "heuristic",
    model: null,
    generatedAt: new Date().toISOString(),
    overallScore,
    totalEstimatedDistanceKm: totalDistance,
    coordinateCoveragePercent: weightedCoverage,
    overallSummary: `Rota analisada com heuristica local usando office, cluster, workload e coordenadas disponiveis. Score geral ${overallScore}/100.`,
    routeHighlights,
    routeRisks,
    managers: managerMetrics,
  };
}

export function buildWhatsAppPayload(
  run: RouteRunReport,
  directoryManagers: RouteDirectoryManager[],
) {
  const managersById = new Map(directoryManagers.map((manager) => [manager.id, manager]));
  const assignmentsByManager = new Map<string, RouteAssignment[]>();

  for (const assignment of run.assignments) {
    const existing = assignmentsByManager.get(assignment.propertyManager.id) ?? [];
    existing.push(assignment);
    assignmentsByManager.set(assignment.propertyManager.id, existing);
  }

  const managerMessages: WhatsAppMessage[] = Array.from(assignmentsByManager.entries())
    .map(([managerId, assignments]) => {
      const orderedAssignments = [...assignments].sort((left, right) => left.routeOrder - right.routeOrder);
      const manager = managersById.get(managerId);
      const office = manager?.office ?? orderedAssignments[0]?.propertyManager.office ?? null;
      const officeAddress = formatOfficeAddress(office);
      const messageLines = [
        `Check-ins do dia ${new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeZone: "UTC",
        }).format(new Date(run.operationDate))}`,
        `PM: ${cleanPropertyManagerName(
          manager?.name ?? orderedAssignments[0]?.propertyManager.name,
        )}`,
        `Office: ${office?.name ?? "Nao definido"}`,
        `Origem: ${officeAddress}`,
        "",
      ];

      orderedAssignments.forEach((assignment) => {
        messageLines.push(
          `${assignment.routeOrder}. ${assignment.checkin.propertyName ?? "Check-in sem imovel"}`,
          `Resort: ${assignment.checkin.condominiumName ?? "Nao informado"}`,
          `Endereco: ${formatCheckinOperationalAddress(assignment.checkin) ?? "Nao informado"}`,
          `Guest: ${assignment.checkin.guestName ?? "Nao informado"}`,
          `Door Code: ${assignment.checkin.doorCode ?? "Nao informado"}`,
          "",
        );
      });

      return {
        propertyManagerId: managerId,
        managerName: cleanPropertyManagerName(
          manager?.name ?? orderedAssignments[0]?.propertyManager.name,
        ),
        phone: manager?.phone ?? null,
        text: messageLines.join("\n").trim(),
      };
    })
    .sort((left, right) => left.managerName.localeCompare(right.managerName));

  return {
    combinedText: managerMessages.map((message) => message.text).join("\n\n--------------------\n\n"),
    managerMessages,
  } satisfies WhatsAppPayload;
}
