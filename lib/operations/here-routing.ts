import "server-only";

import type { CheckinInput, ManagerInput, PlanInput } from "@/lib/operations/ai-distribution";
import type { PlannedAssignment } from "@/lib/operations/distribution";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/upload/normalize";

type Point = { lat: number; lng: number };

type RouteSortableAssignment = {
  id: string;
  propertyManagerId: string;
  checkin: {
    condominiumName: string | null;
    address: string | null;
    propertyName: string | null;
    lat: number | null;
    lng: number | null;
  };
  propertyManager?: {
    office: {
      lat: number | null;
      lng: number | null;
    } | null;
  } | null;
};

type HereRouteSummary = {
  miles: number;
  durationSeconds: number;
  source: "here" | "fallback";
};

declare global {
  var __hereRouteSummaryCache: Map<string, Promise<HereRouteSummary>> | undefined;
}

const DEFAULT_MAX_ROUTE_CALLS_PER_OPERATION = 180;
const ROUTE_CACHE =
  globalThis.__hereRouteSummaryCache ?? (globalThis.__hereRouteSummaryCache = new Map());

function getHereApiKey() {
  return process.env.HERE_API_KEY?.trim() || null;
}

export function hasHereRoutingApiKey() {
  return Boolean(getHereApiKey());
}

function roundCoordinate(value: number) {
  return value.toFixed(5);
}

function buildPointKey(point: Point) {
  return `${roundCoordinate(point.lat)},${roundCoordinate(point.lng)}`;
}

function buildRouteCacheKey(origin: Point, destination: Point) {
  return `${buildPointKey(origin)}->${buildPointKey(destination)}`;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMiles(from: Point, to: Point) {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function buildFallbackSummary(origin: Point, destination: Point): HereRouteSummary {
  const miles = haversineDistanceMiles(origin, destination) * 1.18;
  return {
    miles,
    durationSeconds: Math.round((miles / 28) * 3600),
    source: "fallback",
  };
}

function hasCoordinates(value: { lat: number | null; lng: number | null } | null | undefined) {
  return value?.lat != null && value.lng != null;
}

function getCheckinPoint(checkin: CheckinInput) {
  if (hasCoordinates(checkin)) {
    return {
      lat: checkin.lat!,
      lng: checkin.lng!,
    };
  }

  if (hasCoordinates(checkin.condominium)) {
    return {
      lat: checkin.condominium!.lat!,
      lng: checkin.condominium!.lng!,
    };
  }

  return null;
}

function getResortLabel(checkin: CheckinInput | null) {
  return normalizeText(checkin?.condominiumName ?? "") || "sem-resort";
}

function getAssignmentCheckinFactory(checkins: CheckinInput[]) {
  const byId = new Map(checkins.map((checkin) => [checkin.id, checkin]));
  return (assignment: PlannedAssignment) => byId.get(assignment.checkinId) ?? null;
}

function getManagerOrigin(manager: ManagerInput, assignedPoints: Point[]) {
  if (hasCoordinates(manager.office)) {
    return {
      lat: manager.office!.lat!,
      lng: manager.office!.lng!,
    };
  }

  return assignedPoints[0] ?? null;
}

function getPointsCentroid(points: Point[]) {
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat,
      lng: accumulator.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

function alphabeticalSort<T extends RouteSortableAssignment>(assignments: T[]) {
  return [...assignments].sort((left, right) => {
    return (
      (left.checkin.condominiumName ?? "").localeCompare(right.checkin.condominiumName ?? "") ||
      (left.checkin.address ?? "").localeCompare(right.checkin.address ?? "") ||
      (left.checkin.propertyName ?? "").localeCompare(right.checkin.propertyName ?? "")
    );
  });
}

class HereTravelEngine {
  private readonly apiKey = getHereApiKey();
  private readonly maxCalls: number;
  private callsUsed = 0;

  constructor(maxCalls = Number(process.env.HERE_MAX_ROUTE_CALLS_PER_OPERATION ?? DEFAULT_MAX_ROUTE_CALLS_PER_OPERATION)) {
    this.maxCalls = maxCalls;
  }

  async getRouteSummary(origin: Point | null, destination: Point | null) {
    if (!origin || !destination) {
      return { miles: 0, durationSeconds: 0, source: "fallback" as const };
    }

    if (buildPointKey(origin) === buildPointKey(destination)) {
      return { miles: 0, durationSeconds: 0, source: "fallback" as const };
    }

    const cacheKey = buildRouteCacheKey(origin, destination);
    const existing = ROUTE_CACHE.get(cacheKey);
    if (existing) {
      return existing;
    }

    const promise = this.fetchRouteSummary(origin, destination);
    ROUTE_CACHE.set(cacheKey, promise);
    return promise;
  }

  private async fetchRouteSummary(origin: Point, destination: Point): Promise<HereRouteSummary> {
    if (!this.apiKey || this.callsUsed >= this.maxCalls) {
      return buildFallbackSummary(origin, destination);
    }

    this.callsUsed += 1;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const search = new URLSearchParams({
        transportMode: "car",
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        return: "summary",
        routingMode: "fast",
        departureTime: "any",
        apikey: this.apiKey,
      });
      const response = await fetch(`https://router.hereapi.com/v8/routes?${search.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return buildFallbackSummary(origin, destination);
      }

      const payload = (await response.json()) as {
        routes?: Array<{ sections?: Array<{ summary?: { length?: number; duration?: number } }> }>;
      };
      const summary = payload.routes?.[0]?.sections?.[0]?.summary;

      if (!summary?.length) {
        return buildFallbackSummary(origin, destination);
      }

      return {
        miles: summary.length / 1609.344,
        durationSeconds: summary.duration ?? Math.round((summary.length / 1609.344 / 28) * 3600),
        source: "here",
      };
    } catch {
      return buildFallbackSummary(origin, destination);
    }
  }
}

async function estimateInsertionCostUsingEngine(args: {
  engine: HereTravelEngine;
  point: Point | null;
  manager: ManagerInput;
  assignedPoints: Point[];
}) {
  if (!args.point) {
    return 0;
  }

  const managerOrigin = getManagerOrigin(args.manager, args.assignedPoints);

  if (args.assignedPoints.length === 0) {
    const officeSummary = await args.engine.getRouteSummary(managerOrigin, args.point);
    return officeSummary.miles || 18;
  }

  const sortedCandidates = [...args.assignedPoints]
    .sort(
      (left, right) =>
        haversineDistanceMiles(args.point!, left) - haversineDistanceMiles(args.point!, right),
    )
    .slice(0, 3);

  const candidateSummaries = await Promise.all(
    sortedCandidates.map((candidatePoint) => args.engine.getRouteSummary(candidatePoint, args.point)),
  );
  const nearestAssigned = Math.min(...candidateSummaries.map((summary) => summary.miles));
  const originSummary = await args.engine.getRouteSummary(managerOrigin, args.point);

  return nearestAssigned * 1.8 + originSummary.miles * 0.35;
}

export async function optimizePlanWithHere(input: PlanInput, basePlan: PlannedAssignment[]) {
  if (!hasHereRoutingApiKey()) {
    return basePlan;
  }

  const engine = new HereTravelEngine();
  const getAssignmentCheckin = getAssignmentCheckinFactory(input.checkins);
  const clonedPlan = basePlan.map((assignment) => ({ ...assignment }));
  const assignmentsByManager = new Map<string, PlannedAssignment[]>();

  for (const assignment of clonedPlan) {
    const existing = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
    existing.push(assignment);
    assignmentsByManager.set(assignment.propertyManagerId, existing);
  }

  function getManagerPoints(managerId: string, excludingCheckinId?: string) {
    return (assignmentsByManager.get(managerId) ?? [])
      .filter((assignment) => assignment.checkinId !== excludingCheckinId)
      .map(getAssignmentCheckin)
      .filter((value): value is CheckinInput => Boolean(value))
      .map(getCheckinPoint)
      .filter((value): value is Point => Boolean(value));
  }

  function getManagerAssignedCondominiumOfficeIds(managerId: string, excludingCheckinId?: string) {
    return new Set(
      (assignmentsByManager.get(managerId) ?? [])
        .filter((assignment) => assignment.checkinId !== excludingCheckinId)
        .map(getAssignmentCheckin)
        .map((checkin) => checkin?.condominium?.officeId ?? null)
        .filter((value): value is string => Boolean(value)),
    );
  }

  function moveAssignment(assignment: PlannedAssignment, targetManagerId: string) {
    if (assignment.propertyManagerId === targetManagerId) {
      return;
    }

    const sourceAssignments = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
    assignmentsByManager.set(
      assignment.propertyManagerId,
      sourceAssignments.filter((item) => item.checkinId !== assignment.checkinId),
    );

    const targetAssignments = assignmentsByManager.get(targetManagerId) ?? [];
    targetAssignments.push(assignment);
    assignmentsByManager.set(targetManagerId, targetAssignments);

    assignment.propertyManagerId = targetManagerId;
    assignment.source =
      assignment.source === "default_pm" ? "default_pm" : "here_distribution";
  }

  const targetCount = input.checkins.length / Math.max(1, input.availableManagers.length);

  for (let pass = 0; pass < 16; pass += 1) {
    const managerLoads = input.availableManagers
      .map((manager) => ({
        manager,
        assignments: assignmentsByManager.get(manager.id) ?? [],
      }))
      .sort((left, right) => right.assignments.length - left.assignments.length);

    const overloaded = managerLoads[0];
    const underloaded = managerLoads[managerLoads.length - 1];

    if (!overloaded || !underloaded) {
      break;
    }

    const countGap = overloaded.assignments.length - underloaded.assignments.length;
    if (countGap <= 5) {
      break;
    }

    const overloadedCandidates = overloaded.assignments
      .map((assignment) => {
        const checkin = getAssignmentCheckin(assignment);
        const point = checkin ? getCheckinPoint(checkin) : null;
        const sourcePoints = getManagerPoints(overloaded.manager.id, assignment.checkinId);
        const sourceGroupPoint = getPointsCentroid(sourcePoints);

        return {
          assignment,
          checkin,
          point,
          sourcePoints,
          sourceDrift: point && sourceGroupPoint ? haversineDistanceMiles(point, sourceGroupPoint) : 0,
        };
      })
      .filter(
        (
          item,
        ): item is {
          assignment: PlannedAssignment;
          checkin: CheckinInput;
          point: Point;
          sourcePoints: Point[];
          sourceDrift: number;
        } => Boolean(item.checkin && item.point),
      )
      .sort((left, right) => right.sourceDrift - left.sourceDrift);

    let bestMove:
      | {
          assignment: PlannedAssignment;
          targetManagerId: string;
          score: number;
        }
      | null = null;

    for (const candidate of overloadedCandidates.slice(0, 8)) {
      for (const manager of managerLoads.slice().reverse().slice(0, 3)) {
        if (manager.manager.id === overloaded.manager.id) {
          continue;
        }

        const candidateOfficeId = candidate.checkin.condominium?.officeId ?? null;
        const targetOfficeIds = getManagerAssignedCondominiumOfficeIds(manager.manager.id);

        if (
          input.preventMixedCondominiumOffices &&
          candidateOfficeId &&
          targetOfficeIds.size > 0 &&
          !targetOfficeIds.has(candidateOfficeId)
        ) {
          continue;
        }

        const targetPoints = getManagerPoints(manager.manager.id);
        const sourceCost = await estimateInsertionCostUsingEngine({
          engine,
          point: candidate.point,
          manager: overloaded.manager,
          assignedPoints: candidate.sourcePoints,
        });
        const targetCost = await estimateInsertionCostUsingEngine({
          engine,
          point: candidate.point,
          manager: manager.manager,
          assignedPoints: targetPoints,
        });

        const candidateResort = getResortLabel(candidate.checkin);
        const targetResortMatches = (assignmentsByManager.get(manager.manager.id) ?? []).filter(
          (assignment) => getResortLabel(getAssignmentCheckin(assignment)) === candidateResort,
        ).length;
        const sourceResortMatches = (assignmentsByManager.get(overloaded.manager.id) ?? []).filter(
          (assignment) =>
            assignment.checkinId !== candidate.assignment.checkinId &&
            getResortLabel(getAssignmentCheckin(assignment)) === candidateResort,
        ).length;

        const loadImprovement =
          (overloaded.assignments.length - targetCount) - (manager.assignments.length - targetCount);
        const resortBonus = targetResortMatches > 0 ? -5 : 0;
        const resortProtection = sourceResortMatches > 0 && targetResortMatches === 0 ? 6 : 0;
        const score = targetCost - sourceCost - loadImprovement * 4 + resortBonus + resortProtection;

        if (score < 18 && (!bestMove || score < bestMove.score)) {
          bestMove = {
            assignment: candidate.assignment,
            targetManagerId: manager.manager.id,
            score,
          };
        }
      }
    }

    if (!bestMove) {
      break;
    }

    moveAssignment(bestMove.assignment, bestMove.targetManagerId);
  }

  const orderedPlan = input.availableManagers.flatMap((manager) => {
    const managerAssignments = assignmentsByManager.get(manager.id) ?? [];
    managerAssignments.forEach((assignment, index) => {
      assignment.routeOrder = index + 1;
    });
    return managerAssignments;
  });

  return orderedPlan;
}

async function sortAssignmentsForRouteWithHere<T extends RouteSortableAssignment>(
  engine: HereTravelEngine,
  assignments: T[],
) {
  const alphabeticallySorted = alphabeticalSort(assignments);
  const withCoordinates = alphabeticallySorted.filter(
    (assignment) => assignment.checkin.lat != null && assignment.checkin.lng != null,
  );
  const withoutCoordinates = alphabeticallySorted.filter(
    (assignment) => assignment.checkin.lat == null || assignment.checkin.lng == null,
  );

  if (withCoordinates.length <= 1) {
    return [...withCoordinates, ...withoutCoordinates];
  }

  const route: T[] = [];
  const remaining = [...withCoordinates];
  const officeOriginRecord = alphabeticallySorted.find(
    (assignment) =>
      assignment.propertyManager?.office?.lat != null && assignment.propertyManager?.office?.lng != null,
  )?.propertyManager?.office;
  const officeOrigin =
    officeOriginRecord?.lat != null && officeOriginRecord.lng != null
      ? { lat: officeOriginRecord.lat, lng: officeOriginRecord.lng }
      : null;

  let currentPoint =
    officeOrigin ??
    ({
      lat: remaining[0]!.checkin.lat!,
      lng: remaining[0]!.checkin.lng!,
    } satisfies Point);

  while (remaining.length > 0) {
    const candidateIndexes = remaining
      .map((assignment, index) => ({
        index,
        approxMiles: haversineDistanceMiles(currentPoint, {
          lat: assignment.checkin.lat!,
          lng: assignment.checkin.lng!,
        }),
      }))
      .sort((left, right) => left.approxMiles - right.approxMiles)
      .slice(0, Math.min(3, remaining.length));

    let bestIndex = candidateIndexes[0]?.index ?? 0;
    let bestMiles = Number.POSITIVE_INFINITY;

    for (const candidate of candidateIndexes) {
      const summary = await engine.getRouteSummary(currentPoint, {
        lat: remaining[candidate.index]!.checkin.lat!,
        lng: remaining[candidate.index]!.checkin.lng!,
      });

      if (summary.miles < bestMiles) {
        bestMiles = summary.miles;
        bestIndex = candidate.index;
      }
    }

    const [nextAssignment] = remaining.splice(bestIndex, 1);
    if (!nextAssignment) {
      break;
    }

    route.push(nextAssignment);
    currentPoint = {
      lat: nextAssignment.checkin.lat!,
      lng: nextAssignment.checkin.lng!,
    };
  }

  return [...route, ...withoutCoordinates];
}

export async function resequenceOperationRunWithHere(operationRunId: string) {
  if (!hasHereRoutingApiKey()) {
    return false;
  }

  const assignments = await prisma.operationAssignment.findMany({
    where: {
      operationRunId,
    },
    include: {
      propertyManager: {
        select: {
          office: {
            select: {
              lat: true,
              lng: true,
            },
          },
        },
      },
      checkin: {
        select: {
          condominiumName: true,
          address: true,
          propertyName: true,
          lat: true,
          lng: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const byManager = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const existing = byManager.get(assignment.propertyManagerId) ?? [];
    existing.push(assignment);
    byManager.set(assignment.propertyManagerId, existing);
  }

  const engine = new HereTravelEngine();
  const updates: Array<ReturnType<typeof prisma.operationAssignment.update>> = [];

  for (const managerAssignments of byManager.values()) {
    const sortedAssignments = await sortAssignmentsForRouteWithHere(engine, managerAssignments);
    sortedAssignments.forEach((assignment, index) => {
      updates.push(
        prisma.operationAssignment.update({
          where: { id: assignment.id },
          data: { routeOrder: index + 1 },
        }),
      );
    });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return true;
}
