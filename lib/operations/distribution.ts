import "server-only";

import { normalizeOperationalAddress, normalizeText } from "@/lib/upload/normalize";

type CheckinInput = {
  id: string;
  condominiumId: string | null;
  condominiumName: string | null;
  condominium?: {
    officeId: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  propertyName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  bedroomsSnapshot: number | null;
  propertyManagerId: string | null;
  propertyManagerName: string | null;
  property?: {
    defaultPropertyManagerId: string | null;
  } | null;
};

type ManagerInput = {
  id: string;
  name: string;
  officeId: string | null;
  office?: {
    lat: number | null;
    lng: number | null;
  } | null;
};

type PlanInput = {
  checkins: CheckinInput[];
  availableManagers: ManagerInput[];
  decisionMode: "default" | "override";
  preventMixedCondominiumOffices?: boolean;
  forceEqualCheckins?: boolean;
};

export type PlannedAssignment = {
  checkinId: string;
  propertyManagerId: string;
  routeOrder: number;
  workload: number;
  clusterLabel: string;
  source: string;
};

const MAX_MANAGER_COUNT_GAP = 5;
const SMALL_RESORT_LOCK_THRESHOLD = 10;

function getForceEqualTargetGap(totalCheckins: number, managerCount: number) {
  if (managerCount <= 1) {
    return 0;
  }

  return totalCheckins % managerCount === 0 ? 0 : 1;
}

function getClusterLabel(checkin: CheckinInput) {
  const resortLabel = normalizeText(checkin.condominiumName ?? "") || "sem-resort";
  const streetLabel = getStreetClusterLabel(checkin);
  const point = getCheckinPoint(checkin);

  if (point) {
    const latBucket = Math.round(point.lat / 0.005);
    const lngBucket = Math.round(point.lng / 0.005);
    return streetLabel
      ? `${resortLabel}::${streetLabel}::${latBucket}:${lngBucket}`
      : `${resortLabel}::${latBucket}:${lngBucket}`;
  }

  if (streetLabel) {
    return `${resortLabel}::${streetLabel}`;
  }

  if (checkin.condominiumName) {
    return resortLabel;
  }

  return normalizeText(checkin.address ?? checkin.propertyName ?? "") || "sem-cluster";
}

function getWorkload(checkin: CheckinInput) {
  return Math.max(1, checkin.bedroomsSnapshot ?? 1);
}

function getPreferredManagerId(checkin: CheckinInput) {
  return checkin.property?.defaultPropertyManagerId ?? checkin.propertyManagerId ?? null;
}

function hasCoordinates(point: { lat: number | null; lng: number | null } | null | undefined) {
  return point?.lat != null && point.lng != null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMiles(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
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

function getResortLabel(checkin: CheckinInput) {
  return normalizeText(checkin.condominiumName ?? "") || "sem-resort";
}

function getResortGroupKey(checkin: CheckinInput) {
  return checkin.condominiumId ?? getResortLabel(checkin);
}

function getResortCheckinCounts(checkins: CheckinInput[]) {
  const counts = new Map<string, number>();

  for (const checkin of checkins) {
    const resortKey = getResortGroupKey(checkin);
    counts.set(resortKey, (counts.get(resortKey) ?? 0) + 1);
  }

  return counts;
}

export function enforceSmallResortSingleManager(
  plan: PlannedAssignment[],
  checkins: CheckinInput[],
  threshold = SMALL_RESORT_LOCK_THRESHOLD,
) {
  const checkinById = new Map(checkins.map((checkin) => [checkin.id, checkin]));
  const resortCounts = getResortCheckinCounts(checkins);
  const assignmentsByResort = new Map<string, PlannedAssignment[]>();

  for (const assignment of plan) {
    const checkin = checkinById.get(assignment.checkinId);
    if (!checkin) {
      continue;
    }

    const resortKey = getResortGroupKey(checkin);
    const current = assignmentsByResort.get(resortKey) ?? [];
    current.push(assignment);
    assignmentsByResort.set(resortKey, current);
  }

  for (const [resortKey, assignments] of assignmentsByResort.entries()) {
    const resortCount = resortCounts.get(resortKey) ?? assignments.length;

    if (resortCount >= threshold || assignments.length <= 1) {
      continue;
    }

    const managerCounts = new Map<string, number>();

    for (const assignment of assignments) {
      managerCounts.set(
        assignment.propertyManagerId,
        (managerCounts.get(assignment.propertyManagerId) ?? 0) + 1,
      );
    }

    const dominantManagerId =
      [...managerCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

    if (!dominantManagerId) {
      continue;
    }

    for (const assignment of assignments) {
      assignment.propertyManagerId = dominantManagerId;
      if (assignment.source !== "default_pm") {
        assignment.source = "distribution_resort_locked";
      }
    }
  }

  return plan;
}

function getStreetClusterLabel(checkin: CheckinInput) {
  const normalizedAddress = normalizeOperationalAddress(checkin.address ?? checkin.propertyName ?? "");

  if (!normalizedAddress) {
    return null;
  }

  const normalized = normalizeText(normalizedAddress);
  if (!normalized) {
    return null;
  }

  const withoutHouseNumber = normalized.replace(/^\d+\s+/, "").trim();
  const base = withoutHouseNumber || normalized;
  const tokens = base.split(" ").filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.slice(0, 3).join("-");
}

function areSameResort(left: CheckinInput | null, right: CheckinInput | null) {
  return (
    left?.condominiumName != null &&
    right?.condominiumName != null &&
    normalizeText(left.condominiumName) === normalizeText(right.condominiumName)
  );
}

function hasSameResortAssignment(
  assignments: PlannedAssignment[],
  currentCheckin: CheckinInput | null,
  getAssignmentCheckin: (assignment: PlannedAssignment) => CheckinInput | null,
) {
  return assignments.some((candidateAssignment) =>
    areSameResort(getAssignmentCheckin(candidateAssignment), currentCheckin),
  );
}

function countSameResortAssignments(
  assignments: PlannedAssignment[],
  currentCheckin: CheckinInput | null,
  getAssignmentCheckin: (assignment: PlannedAssignment) => CheckinInput | null,
) {
  return assignments.filter((candidateAssignment) =>
    areSameResort(getAssignmentCheckin(candidateAssignment), currentCheckin),
  ).length;
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

function getGroupPoint(checkins: CheckinInput[]) {
  const points = checkins.map(getCheckinPoint).filter((value): value is { lat: number; lng: number } => Boolean(value));

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

function getPointsCentroid(points: Array<{ lat: number; lng: number }>) {
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

function sortCheckinsForChunking(checkins: CheckinInput[]) {
  return [...checkins].sort((left, right) => {
    const leftPoint = getCheckinPoint(left);
    const rightPoint = getCheckinPoint(right);

    if (leftPoint && rightPoint) {
      return leftPoint.lat - rightPoint.lat || leftPoint.lng - rightPoint.lng;
    }

    return (
      (left.condominiumName ?? "").localeCompare(right.condominiumName ?? "") ||
      (left.address ?? "").localeCompare(right.address ?? "") ||
      (left.propertyName ?? "").localeCompare(right.propertyName ?? "")
    );
  });
}

function getAverageDistanceToPoint(checkins: CheckinInput[], point: { lat: number; lng: number } | null) {
  if (!point) {
    return null;
  }

  const distances = checkins
    .map(getCheckinPoint)
    .filter((value): value is { lat: number; lng: number } => Boolean(value))
    .map((checkinPoint) => haversineDistanceMiles(checkinPoint, point));

  if (distances.length === 0) {
    return null;
  }

  return distances.reduce((total, distance) => total + distance, 0) / distances.length;
}

function getNearestDistanceToAnyPoint(
  point: { lat: number; lng: number } | null,
  candidatePoints: Array<{ lat: number; lng: number }>,
) {
  if (!point || candidatePoints.length === 0) {
    return null;
  }

  return Math.min(...candidatePoints.map((candidatePoint) => haversineDistanceMiles(point, candidatePoint)));
}

function getFarthestDistanceToAnyPoint(
  point: { lat: number; lng: number } | null,
  candidatePoints: Array<{ lat: number; lng: number }>,
) {
  if (!point || candidatePoints.length === 0) {
    return null;
  }

  return Math.max(...candidatePoints.map((candidatePoint) => haversineDistanceMiles(point, candidatePoint)));
}

function estimateInsertionCost(
  point: { lat: number; lng: number } | null,
  managerOrigin: { lat: number; lng: number } | null,
  assignedPoints: Array<{ lat: number; lng: number }>,
) {
  if (!point) {
    return 0;
  }

  if (assignedPoints.length === 0) {
    return managerOrigin ? haversineDistanceMiles(managerOrigin, point) : 18;
  }

  const nearestAssigned = getNearestDistanceToAnyPoint(point, assignedPoints) ?? 0;
  const nearestFromOrigin = managerOrigin ? haversineDistanceMiles(managerOrigin, point) : nearestAssigned;

  return nearestAssigned * 1.8 + nearestFromOrigin * 0.35;
}

function estimateAreaDriftPenalty(
  point: { lat: number; lng: number } | null,
  assignedPoints: Array<{ lat: number; lng: number }>,
) {
  if (!point || assignedPoints.length < 2) {
    return 0;
  }

  const centroid = getPointsCentroid(assignedPoints);
  if (!centroid) {
    return 0;
  }

  const centroidDistance = haversineDistanceMiles(point, centroid);

  if (centroidDistance > 10) {
    return 900 + (centroidDistance - 10) * 120;
  }

  if (centroidDistance > 6) {
    return 360 + (centroidDistance - 6) * 85;
  }

  if (centroidDistance > 3.5) {
    return 120 + (centroidDistance - 3.5) * 48;
  }

  return 0;
}

function getManagerOriginPoint(
  manager: ManagerInput,
  assignedPoints: Array<{ lat: number; lng: number }>,
) {
  if (hasCoordinates(manager.office)) {
    return {
      lat: manager.office!.lat!,
      lng: manager.office!.lng!,
    };
  }

  if (assignedPoints.length > 0) {
    return assignedPoints[0] ?? null;
  }

  return null;
}

export function buildDistributionPlan(input: PlanInput) {
  if (input.availableManagers.length === 0) {
    throw new Error("Selecione pelo menos um PM disponivel para rodar a operacao.");
  }

  const totalCheckins = input.checkins.length;
  const totalWorkload = input.checkins.reduce((total, checkin) => total + getWorkload(checkin), 0);
  const targetCheckinsPerManager = totalCheckins / input.availableManagers.length;
  const targetWorkloadPerManager = totalWorkload / input.availableManagers.length;
  const forcedEqualTargetGap = getForceEqualTargetGap(totalCheckins, input.availableManagers.length);
  const maxAllowedCountGap = input.forceEqualCheckins
    ? forcedEqualTargetGap
    : MAX_MANAGER_COUNT_GAP;

  const managerStats = new Map(
    input.availableManagers.map((manager) => [
      manager.id,
      {
        totalCheckins: 0,
        totalWorkload: 0,
        clusters: new Set<string>(),
        resorts: new Set<string>(),
        streets: new Set<string>(),
        condominiumOffices: new Set<string>(),
        assignedPoints: [] as Array<{ lat: number; lng: number }>,
      },
    ]),
  );

  const resortCheckinCounts = getResortCheckinCounts(input.checkins);

  const groupedCheckins = new Map<string, CheckinInput[]>();

  for (const checkin of input.checkins) {
    const resortKey = getResortGroupKey(checkin);
    const resortCount = resortCheckinCounts.get(resortKey) ?? 0;
    const clusterLabel = resortCount > 0 && resortCount < 10 ? `resort-lock::${resortKey}` : getClusterLabel(checkin);
    const existing = groupedCheckins.get(clusterLabel) ?? [];
    existing.push(checkin);
    groupedCheckins.set(clusterLabel, existing);
  }

  const maxChunkSize = Math.max(4, Math.min(10, Math.ceil(targetCheckinsPerManager * 0.55)));
  const distributionGroups = Array.from(groupedCheckins.entries()).flatMap(([clusterLabel, checkins]) => {
    const resortKey = getResortGroupKey(checkins[0]!);
    const resortCount = resortCheckinCounts.get(resortKey) ?? checkins.length;

    if (resortCount < 10 || checkins.length <= maxChunkSize) {
      return [[clusterLabel, checkins] as [string, CheckinInput[]]];
    }

    const sortedCheckins = sortCheckinsForChunking(checkins);
    const chunks: Array<[string, CheckinInput[]]> = [];

    for (let index = 0; index < sortedCheckins.length; index += maxChunkSize) {
      chunks.push([
        `${clusterLabel}::chunk-${Math.floor(index / maxChunkSize) + 1}`,
        sortedCheckins.slice(index, index + maxChunkSize),
      ]);
    }

    return chunks;
  });

  const orderedGroups = distributionGroups.sort((left, right) => {
    const leftWorkload = left[1].reduce((total, checkin) => total + getWorkload(checkin), 0);
    const rightWorkload = right[1].reduce((total, checkin) => total + getWorkload(checkin), 0);

    return rightWorkload - leftWorkload || right[1].length - left[1].length;
  });

  const plannedAssignments: PlannedAssignment[] = [];
  const assignmentsByManager = new Map<string, PlannedAssignment[]>();

  function registerPlannedAssignment(assignment: PlannedAssignment) {
    plannedAssignments.push(assignment);
    const existing = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
    existing.push(assignment);
    assignmentsByManager.set(assignment.propertyManagerId, existing);
  }

  function moveAssignmentToManager(
    assignment: PlannedAssignment,
    targetManagerId: string,
    source:
      | "distribution_rebalanced"
      | "distribution_isolation_fix"
      | "distribution_route_optimized",
  ) {
    if (assignment.propertyManagerId === targetManagerId) {
      return;
    }

    const currentAssignments = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
    assignmentsByManager.set(
      assignment.propertyManagerId,
      currentAssignments.filter((item) => item.checkinId !== assignment.checkinId),
    );

    const targetAssignments = assignmentsByManager.get(targetManagerId) ?? [];
    targetAssignments.push(assignment);
    assignmentsByManager.set(targetManagerId, targetAssignments);

    assignment.propertyManagerId = targetManagerId;
    assignment.source = assignment.source === "default_pm" ? "default_pm" : source;
  }

  function moveAssignmentsGroupToManager(
    assignments: PlannedAssignment[],
    targetManagerId: string,
    source:
      | "distribution_rebalanced"
      | "distribution_isolation_fix"
      | "distribution_route_optimized",
  ) {
    for (const assignment of assignments) {
      moveAssignmentToManager(assignment, targetManagerId, source);
    }
  }

  function chooseBestManager(args: {
    clusterLabel: string;
    resortLabel: string;
    streetLabel: string | null;
    preferredOfficeId: string | null;
    preferredManagerId: string | null;
    groupPoint: { lat: number; lng: number } | null;
    checkins: CheckinInput[];
  }) {
    let bestManagerId = input.availableManagers[0]?.id;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const manager of input.availableManagers) {
      const stats = managerStats.get(manager.id);

      if (!stats) continue;

      const clusterPenalty = stats.clusters.has(args.clusterLabel) ? -120 : stats.clusters.size * 22;
      const resortContinuityPenalty = stats.resorts.has(args.resortLabel) ? -64 : 0;
      const streetContinuityPenalty =
        args.streetLabel == null
          ? 0
          : stats.streets.has(args.streetLabel)
            ? -92
            : stats.streets.size > 0
              ? 28
              : 0;
      const newResortPenalty =
        stats.resorts.has(args.resortLabel)
          ? 0
          : stats.resorts.size >= 5
            ? 420 + stats.resorts.size * 65
            : stats.resorts.size >= 3
              ? 210 + stats.resorts.size * 35
              : stats.resorts.size >= 1
                ? 70 + stats.resorts.size * 18
                : 18;
      const preferredManagerPenalty =
        args.preferredManagerId == null
          ? 0
          : manager.id === args.preferredManagerId
            ? -58
            : 36;
      const officePenalty = 0;
      const condominiumOfficeMixingPenalty =
        input.preventMixedCondominiumOffices && args.preferredOfficeId
          ? stats.condominiumOffices.size === 0 || stats.condominiumOffices.has(args.preferredOfficeId)
            ? 0
            : 20000
          : 0;

      const managerOriginPoint = getManagerOriginPoint(manager, stats.assignedPoints);
      const insertionCostPenalty = estimateInsertionCost(
        args.groupPoint,
        managerOriginPoint,
        stats.assignedPoints,
      ) * 38;
      const areaDriftPenalty = estimateAreaDriftPenalty(args.groupPoint, stats.assignedPoints);
      const officeStartPenalty =
        args.groupPoint && hasCoordinates(manager.office) && stats.assignedPoints.length === 0
          ? haversineDistanceMiles(args.groupPoint, {
              lat: manager.office!.lat!,
              lng: manager.office!.lng!,
            }) * 9
          : 0;

      const nearestAssignedDistance =
        args.groupPoint && stats.assignedPoints.length > 0
          ? Math.min(
              ...stats.assignedPoints.map((point) => haversineDistanceMiles(args.groupPoint!, point)),
            )
          : null;
      const averageGroupDistance = getAverageDistanceToPoint(args.checkins, args.groupPoint);
      const dispersionPenalty = nearestAssignedDistance == null ? 0 : nearestAssignedDistance * 34;
      const isolationPenalty =
        nearestAssignedDistance != null && nearestAssignedDistance > 5
          ? 360 + (nearestAssignedDistance - 5) * 85
          : nearestAssignedDistance != null && nearestAssignedDistance > 2.5
            ? 145 + (nearestAssignedDistance - 2.5) * 58
            : 0;
      const groupSpreadPenalty = averageGroupDistance != null ? averageGroupDistance * 18 : 0;
      const quantityPenalty = stats.totalCheckins * 3.4;
      const workloadPenalty = stats.totalWorkload * 1.5;
      const nextCheckins = stats.totalCheckins + args.checkins.length;
      const nextWorkload = stats.totalWorkload + args.checkins.reduce((total, checkin) => total + getWorkload(checkin), 0);
      const overloadCheckinsPenalty =
        nextCheckins > targetCheckinsPerManager * 1.18
          ? 320 + (nextCheckins - targetCheckinsPerManager * 1.18) * 65
          : nextCheckins > targetCheckinsPerManager
            ? (nextCheckins - targetCheckinsPerManager) * 28
            : 0;
      const overloadWorkloadPenalty =
        nextWorkload > targetWorkloadPerManager * 1.18
          ? 260 + (nextWorkload - targetWorkloadPerManager * 1.18) * 30
          : nextWorkload > targetWorkloadPerManager
            ? (nextWorkload - targetWorkloadPerManager) * 16
            : 0;
      const hardOverloadPenalty =
        nextCheckins > Math.ceil(targetCheckinsPerManager + 6)
          ? 520 + (nextCheckins - Math.ceil(targetCheckinsPerManager + 6)) * 90
          : 0;
      const imbalancePenalty =
        Math.max(0, nextCheckins - targetCheckinsPerManager) * 22 +
        Math.max(0, nextWorkload - targetWorkloadPerManager) * 8;
      const score =
        clusterPenalty +
        resortContinuityPenalty +
        streetContinuityPenalty +
        newResortPenalty +
        preferredManagerPenalty +
        officePenalty +
        condominiumOfficeMixingPenalty +
        insertionCostPenalty +
        areaDriftPenalty +
        officeStartPenalty +
        dispersionPenalty +
        isolationPenalty +
        groupSpreadPenalty +
        quantityPenalty +
        workloadPenalty +
        overloadCheckinsPenalty +
        overloadWorkloadPenalty +
        hardOverloadPenalty +
        imbalancePenalty;

      if (score < bestScore) {
        bestScore = score;
        bestManagerId = manager.id;
      }
    }

    if (!bestManagerId) {
      throw new Error("Nao foi possivel escolher um PM para a distribuicao.");
    }

    return bestManagerId;
  }

  for (const [clusterLabel, checkins] of orderedGroups) {
    const preferredManagers = new Set(
      checkins.map(getPreferredManagerId).filter((value): value is string => Boolean(value)),
    );
    const preferredManagerId =
      input.decisionMode === "default" && preferredManagers.size === 1
        ? Array.from(preferredManagers)[0]
        : null;
    const preferredOfficeId =
      checkins.length > 0 &&
      checkins.every((checkin) => checkin.condominium?.officeId === checkins[0]?.condominium?.officeId)
        ? checkins[0]?.condominium?.officeId ?? null
        : null;
    const resortLabel = getResortLabel(checkins[0]!);
    const streetLabel = getStreetClusterLabel(checkins[0]!);
    const groupPoint = getGroupPoint(checkins);
    const chosenManagerId = chooseBestManager({
      clusterLabel,
      resortLabel,
      streetLabel,
      preferredOfficeId,
      preferredManagerId: preferredManagerId && managerStats.has(preferredManagerId) ? preferredManagerId : null,
      groupPoint,
      checkins,
    });

    for (const checkin of checkins) {
      const workload = getWorkload(checkin);
      const stats = managerStats.get(chosenManagerId);

      if (!stats) {
        throw new Error("PM escolhido nao possui estatisticas carregadas.");
      }

      stats.totalCheckins += 1;
      stats.totalWorkload += workload;
      stats.clusters.add(clusterLabel);
      stats.resorts.add(resortLabel);
      if (streetLabel) {
        stats.streets.add(streetLabel);
      }
      if (preferredOfficeId) {
        stats.condominiumOffices.add(preferredOfficeId);
      }
      const checkinPoint = getCheckinPoint(checkin);
      if (checkinPoint) {
        stats.assignedPoints.push(checkinPoint);
      }

      registerPlannedAssignment({
        checkinId: checkin.id,
        propertyManagerId: chosenManagerId,
        routeOrder: 0,
        workload,
        clusterLabel,
        source:
          preferredManagerId && chosenManagerId === preferredManagerId
            ? "default_pm"
            : input.decisionMode === "override"
              ? "override_distribution"
              : "distribution",
      });
    }
  }

  function getAssignmentCheckin(assignment: PlannedAssignment) {
    return input.checkins.find((checkin) => checkin.id === assignment.checkinId) ?? null;
  }

  function getManagerAssignedPoints(managerId: string, excludingAssignmentId?: string) {
    return (assignmentsByManager.get(managerId) ?? [])
      .filter((assignment) => assignment.checkinId !== excludingAssignmentId)
      .map(getAssignmentCheckin)
      .filter((value): value is CheckinInput => Boolean(value))
      .map(getCheckinPoint)
      .filter((value): value is { lat: number; lng: number } => Boolean(value));
  }

  function getManagerAssignedCondominiumOfficeIds(managerId: string, excludingAssignmentId?: string) {
    const officeIds = new Set(
      (assignmentsByManager.get(managerId) ?? [])
        .filter((assignment) => assignment.checkinId !== excludingAssignmentId)
        .map(getAssignmentCheckin)
        .map((checkin) => checkin?.condominium?.officeId ?? null)
        .filter((value): value is string => Boolean(value)),
    );

    const managerOfficeId =
      input.availableManagers.find((manager) => manager.id === managerId)?.officeId ?? null;

    if (managerOfficeId) {
      officeIds.add(managerOfficeId);
    }

    return officeIds;
  }

  for (const assignment of plannedAssignments) {
    const checkin = getAssignmentCheckin(assignment);
    const point = checkin ? getCheckinPoint(checkin) : null;
    if (!point) {
      continue;
    }

    let currentManagerId = assignment.propertyManagerId;
    let currentPoints = getManagerAssignedPoints(currentManagerId, assignment.checkinId);
    let currentManager = input.availableManagers.find((manager) => manager.id === currentManagerId) ?? null;
    let currentCost = estimateInsertionCost(
      point,
      currentManager ? getManagerOriginPoint(currentManager, currentPoints) : null,
      currentPoints,
    );

    for (const manager of input.availableManagers) {
      if (manager.id === currentManagerId) {
        continue;
      }

      const candidateOfficeIds = getManagerAssignedCondominiumOfficeIds(manager.id);
      const checkinCondominiumOfficeId = checkin?.condominium?.officeId ?? null;

      if (
        input.preventMixedCondominiumOffices &&
        checkinCondominiumOfficeId &&
        candidateOfficeIds.size > 0 &&
        !candidateOfficeIds.has(checkinCondominiumOfficeId)
      ) {
        continue;
      }

      const candidatePoints = getManagerAssignedPoints(manager.id);
      const candidateCost = estimateInsertionCost(
        point,
        getManagerOriginPoint(manager, candidatePoints),
        candidatePoints,
      );

      const currentNearest = getNearestDistanceToAnyPoint(point, currentPoints);
      const candidateNearest = getNearestDistanceToAnyPoint(point, candidatePoints);
      const currentIsolated = currentNearest != null && currentNearest > 4;
      const candidateBetterCluster =
        candidateNearest != null && (currentNearest == null || candidateNearest + 1.25 < currentNearest);
      const strongGain = candidateCost + 8 < currentCost;
      const severeIsolationGain =
        currentNearest != null &&
        candidateNearest != null &&
        currentNearest > 6 &&
        candidateNearest < currentNearest - 2;

      if (strongGain || (currentIsolated && candidateBetterCluster) || severeIsolationGain) {
        moveAssignmentToManager(assignment, manager.id, "distribution_rebalanced");
        currentManagerId = manager.id;
        currentPoints = candidatePoints;
        currentManager = manager;
        currentCost = candidateCost;
      }
    }
  }

  for (let pass = 0; pass < 4; pass += 1) {
    const managerLoads = input.availableManagers
      .map((manager) => ({
        managerId: manager.id,
        assignments: assignmentsByManager.get(manager.id) ?? [],
      }))
      .sort((left, right) => right.assignments.length - left.assignments.length);

    const overloaded = managerLoads[0];
    const underloaded = managerLoads[managerLoads.length - 1];

    if (!overloaded || !underloaded) {
      break;
    }

    if (overloaded.assignments.length - underloaded.assignments.length < 5) {
      break;
    }

    const overloadedCandidates = overloaded.assignments
      .map((assignment) => {
        const checkin = getAssignmentCheckin(assignment);
        const point = checkin ? getCheckinPoint(checkin) : null;
        const currentPoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
        const currentNearest = getNearestDistanceToAnyPoint(point, currentPoints) ?? 0;
        const currentFarthest = getFarthestDistanceToAnyPoint(point, currentPoints) ?? currentNearest;

        return {
          assignment,
          point,
          currentNearest,
          currentFarthest,
        };
      })
      .filter((item) => item.point != null)
      .sort((left, right) => right.currentFarthest - left.currentFarthest || right.currentNearest - left.currentNearest);

    let moved = false;

    for (const candidate of overloadedCandidates) {
      const underloadedManager = input.availableManagers.find((manager) => manager.id === underloaded.managerId);
      const overloadedManager = input.availableManagers.find((manager) => manager.id === overloaded.managerId);

      if (!underloadedManager || !overloadedManager || !candidate.point) {
        continue;
      }

      const candidateCheckinOfficeId =
        getAssignmentCheckin(candidate.assignment)?.condominium?.officeId ?? null;
      const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.managerId);

      if (
        input.preventMixedCondominiumOffices &&
        candidateCheckinOfficeId &&
        underloadedOfficeIds.size > 0 &&
        !underloadedOfficeIds.has(candidateCheckinOfficeId)
      ) {
        continue;
      }

      const sourcePoints = getManagerAssignedPoints(overloaded.managerId, candidate.assignment.checkinId);
      const targetPoints = getManagerAssignedPoints(underloaded.managerId);
      const sourceCost = estimateInsertionCost(
        candidate.point,
        getManagerOriginPoint(overloadedManager, sourcePoints),
        sourcePoints,
      );
      const targetCost = estimateInsertionCost(
        candidate.point,
        getManagerOriginPoint(underloadedManager, targetPoints),
        targetPoints,
      );
      const targetNearest = getNearestDistanceToAnyPoint(candidate.point, targetPoints) ?? targetCost;

      if (targetCost + 8 < sourceCost || targetNearest + 2 < candidate.currentNearest) {
        moveAssignmentToManager(candidate.assignment, underloaded.managerId, "distribution_rebalanced");
        moved = true;
        break;
      }
    }

    if (!moved) {
      break;
    }
  }

  for (const assignment of plannedAssignments) {
    const checkin = getAssignmentCheckin(assignment);
    const point = checkin ? getCheckinPoint(checkin) : null;

    if (!point) {
      continue;
    }

    const currentAssignments = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
    const currentPoints = getManagerAssignedPoints(assignment.propertyManagerId, assignment.checkinId);
    const currentNearest = getNearestDistanceToAnyPoint(point, currentPoints);

    if (currentNearest == null || currentNearest <= 7) {
      continue;
    }

    let bestTargetManagerId: string | null = null;
    let bestTargetDistance = currentNearest;

    for (const manager of input.availableManagers) {
      if (manager.id === assignment.propertyManagerId) {
        continue;
      }

      const candidateOfficeIds = getManagerAssignedCondominiumOfficeIds(manager.id);
      const checkinOfficeId = checkin?.condominium?.officeId ?? null;

      if (
        input.preventMixedCondominiumOffices &&
        checkinOfficeId &&
        candidateOfficeIds.size > 0 &&
        !candidateOfficeIds.has(checkinOfficeId)
      ) {
        continue;
      }

      const candidatePoints = getManagerAssignedPoints(manager.id);
      const candidateNearest = getNearestDistanceToAnyPoint(point, candidatePoints);
      const candidateOrigin = getManagerOriginPoint(manager, candidatePoints);
      const candidateFromOrigin = candidateOrigin
        ? haversineDistanceMiles(point, candidateOrigin)
        : null;

      if (
        candidateNearest != null &&
        candidateNearest + 1.5 < bestTargetDistance &&
        (candidateFromOrigin == null || candidateFromOrigin < currentNearest + 6)
      ) {
        bestTargetDistance = candidateNearest;
        bestTargetManagerId = manager.id;
      }
    }

    if (bestTargetManagerId) {
      assignmentsByManager.set(
        assignment.propertyManagerId,
        currentAssignments.filter((item) => item.checkinId !== assignment.checkinId),
      );
      moveAssignmentToManager(assignment, bestTargetManagerId, "distribution_isolation_fix");
    }
  }

  for (let pass = 0; pass < 5; pass += 1) {
    let movedInPass = false;

    const assignmentsByIsolation = [...plannedAssignments]
      .map((assignment) => {
        const checkin = getAssignmentCheckin(assignment);
        const point = checkin ? getCheckinPoint(checkin) : null;
        const currentPoints = getManagerAssignedPoints(assignment.propertyManagerId, assignment.checkinId);
        const nearest = getNearestDistanceToAnyPoint(point, currentPoints) ?? 0;
        const farthest = getFarthestDistanceToAnyPoint(point, currentPoints) ?? nearest;
        return {
          assignment,
          point,
          nearest,
          farthest,
        };
      })
      .sort((left, right) => right.farthest - left.farthest || right.nearest - left.nearest);

    for (const item of assignmentsByIsolation) {
      if (!item.point || item.farthest < 3.5) {
        continue;
      }

      const currentManager =
        input.availableManagers.find((manager) => manager.id === item.assignment.propertyManagerId) ?? null;
      if (!currentManager) {
        continue;
      }

      const currentPoints = getManagerAssignedPoints(item.assignment.propertyManagerId, item.assignment.checkinId);
      const currentOrigin = getManagerOriginPoint(currentManager, currentPoints);
      const currentCost = estimateInsertionCost(item.point, currentOrigin, currentPoints);
      const currentNearest = getNearestDistanceToAnyPoint(item.point, currentPoints) ?? currentCost;
      const currentFarthest = getFarthestDistanceToAnyPoint(item.point, currentPoints) ?? currentNearest;
      const currentLoad = (assignmentsByManager.get(item.assignment.propertyManagerId) ?? []).length;

      let bestTargetManagerId: string | null = null;
      let bestTargetScore =
        currentCost +
        currentNearest * 2.2 +
        currentFarthest * 1.15 +
        Math.max(0, currentLoad - targetCheckinsPerManager) * 3.5;

      for (const manager of input.availableManagers) {
        if (manager.id === item.assignment.propertyManagerId) {
          continue;
        }

        const candidateOfficeIds = getManagerAssignedCondominiumOfficeIds(manager.id);
        const currentCheckin = getAssignmentCheckin(item.assignment);
        const checkinOfficeId = currentCheckin?.condominium?.officeId ?? null;

        if (
          input.preventMixedCondominiumOffices &&
          checkinOfficeId &&
          candidateOfficeIds.size > 0 &&
          !candidateOfficeIds.has(checkinOfficeId)
        ) {
          continue;
        }

        const candidateAssignments = assignmentsByManager.get(manager.id) ?? [];
        const candidatePoints = getManagerAssignedPoints(manager.id);
        const candidateOrigin = getManagerOriginPoint(manager, candidatePoints);
        const candidateCost = estimateInsertionCost(item.point, candidateOrigin, candidatePoints);
        const candidateNearest = getNearestDistanceToAnyPoint(item.point, candidatePoints) ?? candidateCost;
        const candidateFarthest = getFarthestDistanceToAnyPoint(item.point, candidatePoints) ?? candidateNearest;
        const candidateLoad = candidateAssignments.length;
        const candidateHasSameResort = hasSameResortAssignment(
          candidateAssignments,
          currentCheckin,
          getAssignmentCheckin,
        );
        const candidateScore =
          candidateCost +
          candidateNearest * 2.1 +
          candidateFarthest * 0.8 +
          Math.max(0, candidateLoad - targetCheckinsPerManager) * 2.8 +
          (candidateHasSameResort ? -18 : 0);

        if (candidateScore + 2 < bestTargetScore) {
          bestTargetScore = candidateScore;
          bestTargetManagerId = manager.id;
        }
      }

      if (bestTargetManagerId) {
        moveAssignmentToManager(item.assignment, bestTargetManagerId, "distribution_route_optimized");
        movedInPass = true;
      }
    }

    if (!movedInPass) {
      break;
    }
  }

  for (let pass = 0; pass < 12; pass += 1) {
    const managerLoads = input.availableManagers
      .map((manager) => ({
        managerId: manager.id,
        assignments: assignmentsByManager.get(manager.id) ?? [],
      }))
      .sort((left, right) => right.assignments.length - left.assignments.length);

    const overloaded = managerLoads[0];
    const underloaded = managerLoads[managerLoads.length - 1];

    if (!overloaded || !underloaded) {
      break;
    }

    const countGap = overloaded.assignments.length - underloaded.assignments.length;

    if (countGap <= maxAllowedCountGap) {
      break;
    }

    const underloadedManager = input.availableManagers.find(
      (manager) => manager.id === underloaded.managerId,
    );
    const overloadedManager = input.availableManagers.find(
      (manager) => manager.id === overloaded.managerId,
    );

    if (!underloadedManager || !overloadedManager) {
      break;
    }

    const candidateMoves = overloaded.assignments
      .map((assignment) => {
        const checkin = getAssignmentCheckin(assignment);
        const point = checkin ? getCheckinPoint(checkin) : null;

        if (!point) {
          return null;
        }

        const sourcePoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
        const targetPoints = getManagerAssignedPoints(underloaded.managerId);
        const sourceOrigin = getManagerOriginPoint(overloadedManager, sourcePoints);
        const targetOrigin = getManagerOriginPoint(underloadedManager, targetPoints);
        const sourceCost = estimateInsertionCost(point, sourceOrigin, sourcePoints);
        const targetCost = estimateInsertionCost(point, targetOrigin, targetPoints);
        const sourceNearest = getNearestDistanceToAnyPoint(point, sourcePoints) ?? sourceCost;
        const targetNearest = getNearestDistanceToAnyPoint(point, targetPoints) ?? targetCost;
        const sourceAreaPenalty = estimateAreaDriftPenalty(point, sourcePoints);
        const targetAreaPenalty = estimateAreaDriftPenalty(point, targetPoints);
        const currentCheckin = getAssignmentCheckin(assignment);
        const targetHasSameResort = (assignmentsByManager.get(underloaded.managerId) ?? []).some(
          (candidateAssignment) => {
            const candidateCheckin = getAssignmentCheckin(candidateAssignment);
            return (
              candidateCheckin?.condominiumName != null &&
              currentCheckin?.condominiumName != null &&
              normalizeText(candidateCheckin.condominiumName) ===
                normalizeText(currentCheckin.condominiumName)
            );
          },
        );

        const balanceGain = countGap * 140;
        const routePenalty =
          (targetCost - sourceCost) * 14 +
          (targetNearest - sourceNearest) * 18 +
          (targetAreaPenalty - sourceAreaPenalty) * 0.12;
        const resortBonus = targetHasSameResort ? 42 : 0;
        const score = routePenalty - balanceGain - resortBonus;

        return {
          assignment,
          score,
          targetCost,
          sourceCost,
          targetNearest,
          sourceNearest,
          targetAreaPenalty,
          sourceAreaPenalty,
        };
      })
      .filter(
        (
          item,
        ): item is {
          assignment: PlannedAssignment;
          score: number;
          targetCost: number;
          sourceCost: number;
          targetNearest: number;
          sourceNearest: number;
          targetAreaPenalty: number;
          sourceAreaPenalty: number;
        } => Boolean(item),
      )
      .sort((left, right) => left.score - right.score);

    const bestMove = candidateMoves.find((candidate) => {
      const candidateCheckinOfficeId =
        getAssignmentCheckin(candidate.assignment)?.condominium?.officeId ?? null;
      const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.managerId);

      if (
        input.preventMixedCondominiumOffices &&
        candidateCheckinOfficeId &&
        underloadedOfficeIds.size > 0 &&
        !underloadedOfficeIds.has(candidateCheckinOfficeId)
      ) {
        return false;
      }

      if (candidate.targetAreaPenalty > candidate.sourceAreaPenalty + 260) {
        return false;
      }

      if (candidate.targetNearest > candidate.sourceNearest + 4.5) {
        return false;
      }

      if (candidate.targetCost > candidate.sourceCost + 9.5 && candidate.score > -70) {
        return false;
      }

      return candidate.score < (countGap > MAX_MANAGER_COUNT_GAP + 4 ? 55 : 0);
    });

    if (!bestMove) {
      break;
    }

    moveAssignmentToManager(bestMove.assignment, underloaded.managerId, "distribution_rebalanced");
  }

  for (let pass = 0; pass < 8; pass += 1) {
    let movedInPass = false;

    const assignmentsByDistance = [...plannedAssignments]
      .map((assignment) => {
        const checkin = getAssignmentCheckin(assignment);
        const point = checkin ? getCheckinPoint(checkin) : null;
        const currentAssignments = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
        const currentPoints = getManagerAssignedPoints(assignment.propertyManagerId, assignment.checkinId);
        const nearest = getNearestDistanceToAnyPoint(point, currentPoints) ?? 0;
        const farthest = getFarthestDistanceToAnyPoint(point, currentPoints) ?? nearest;

        return {
          assignment,
          checkin,
          point,
          currentAssignments,
          nearest,
          farthest,
        };
      })
      .filter(
        (
          item,
        ): item is {
          assignment: PlannedAssignment;
          checkin: CheckinInput;
          point: { lat: number; lng: number };
          currentAssignments: PlannedAssignment[];
          nearest: number;
          farthest: number;
        } => Boolean(item.checkin && item.point),
      )
      .sort((left, right) => right.farthest - left.farthest || right.nearest - left.nearest);

    for (const item of assignmentsByDistance) {
      if (item.nearest <= 1.6 && item.farthest <= 4.5) {
        continue;
      }

      let bestTargetManagerId: string | null = null;
      let bestGain = 0;

      for (const manager of input.availableManagers) {
        if (manager.id === item.assignment.propertyManagerId) {
          continue;
        }

        const candidateOfficeIds = getManagerAssignedCondominiumOfficeIds(manager.id);
        const checkinOfficeId = item.checkin.condominium?.officeId ?? null;

        if (
          input.preventMixedCondominiumOffices &&
          checkinOfficeId &&
          candidateOfficeIds.size > 0 &&
          !candidateOfficeIds.has(checkinOfficeId)
        ) {
          continue;
        }

        const candidateAssignments = assignmentsByManager.get(manager.id) ?? [];
        const candidateHasSameResort = hasSameResortAssignment(
          candidateAssignments,
          item.checkin,
          getAssignmentCheckin,
        );
        const currentSameResortCount = countSameResortAssignments(
          item.currentAssignments,
          item.checkin,
          getAssignmentCheckin,
        );
        const candidateSameResortCount = countSameResortAssignments(
          candidateAssignments,
          item.checkin,
          getAssignmentCheckin,
        );

        if (!candidateHasSameResort) {
          continue;
        }

        const candidatePoints = getManagerAssignedPoints(manager.id);
        const candidateNearest = getNearestDistanceToAnyPoint(item.point, candidatePoints);
        const currentNearest = item.nearest;
        const candidateLoad = candidateAssignments.length;
        const currentLoad = item.currentAssignments.length;
        const candidateCanAbsorbSameResort =
          candidateSameResortCount >= currentSameResortCount + 2 ||
          (currentSameResortCount <= 1 && candidateSameResortCount >= 1);

        if (candidateNearest == null) {
          continue;
        }

        if (!candidateCanAbsorbSameResort) {
          continue;
        }

        const consolidationGain =
          (currentNearest - candidateNearest) * 26 +
          Math.max(0, item.farthest - candidateNearest) * 12 -
          Math.max(0, candidateLoad - currentLoad) * 5;

        if (
          currentNearest > 2.5 &&
          candidateNearest + 0.75 < currentNearest &&
          consolidationGain > bestGain
        ) {
          bestGain = consolidationGain;
          bestTargetManagerId = manager.id;
        }
      }

      if (bestTargetManagerId) {
        moveAssignmentToManager(item.assignment, bestTargetManagerId, "distribution_route_optimized");
        movedInPass = true;
      }
    }

    if (!movedInPass) {
      break;
    }
  }

  for (let pass = 0; pass < 20; pass += 1) {
    const managerLoads = input.availableManagers
      .map((manager) => ({
        managerId: manager.id,
        assignments: assignmentsByManager.get(manager.id) ?? [],
      }))
      .sort((left, right) => right.assignments.length - left.assignments.length);

    const overloaded = managerLoads[0];
    const underloaded = managerLoads[managerLoads.length - 1];

    if (!overloaded || !underloaded) {
      break;
    }

    const countGap = overloaded.assignments.length - underloaded.assignments.length;
    if (countGap <= MAX_MANAGER_COUNT_GAP) {
      break;
    }

    const overloadedManager = input.availableManagers.find((manager) => manager.id === overloaded.managerId);
    const underloadedManager = input.availableManagers.find((manager) => manager.id === underloaded.managerId);

    if (!overloadedManager || !underloadedManager) {
      break;
    }

    const candidate = overloaded.assignments
      .map((assignment) => {
        const checkin = getAssignmentCheckin(assignment);
        const point = checkin ? getCheckinPoint(checkin) : null;

        if (!point) {
          return null;
        }

        const sourcePoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
        const targetPoints = getManagerAssignedPoints(underloaded.managerId);
        const sourceOrigin = getManagerOriginPoint(overloadedManager, sourcePoints);
        const targetOrigin = getManagerOriginPoint(underloadedManager, targetPoints);
        const sourceCost = estimateInsertionCost(point, sourceOrigin, sourcePoints);
        const targetCost = estimateInsertionCost(point, targetOrigin, targetPoints);
        const sourceNearest = getNearestDistanceToAnyPoint(point, sourcePoints) ?? sourceCost;
        const targetNearest = getNearestDistanceToAnyPoint(point, targetPoints) ?? targetCost;
        const sourceAreaPenalty = estimateAreaDriftPenalty(point, sourcePoints);
        const targetAreaPenalty = estimateAreaDriftPenalty(point, targetPoints);

        const movementPenalty =
          (targetCost - sourceCost) * 10 +
          (targetNearest - sourceNearest) * 12 +
          (targetAreaPenalty - sourceAreaPenalty) * 0.08;

        return {
          assignment,
          movementPenalty,
          sourceCost,
          targetCost,
          sourceNearest,
          targetNearest,
          sourceAreaPenalty,
          targetAreaPenalty,
        };
      })
      .filter(
        (
          item,
        ): item is {
          assignment: PlannedAssignment;
          movementPenalty: number;
          sourceCost: number;
          targetCost: number;
          sourceNearest: number;
          targetNearest: number;
          sourceAreaPenalty: number;
          targetAreaPenalty: number;
        } => Boolean(item),
      )
      .sort((left, right) => left.movementPenalty - right.movementPenalty)
      .find((item) => {
        const candidateCheckinOfficeId =
          getAssignmentCheckin(item.assignment)?.condominium?.officeId ?? null;
        const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.managerId);

        if (
          input.preventMixedCondominiumOffices &&
          candidateCheckinOfficeId &&
          underloadedOfficeIds.size > 0 &&
          !underloadedOfficeIds.has(candidateCheckinOfficeId)
        ) {
          return false;
        }

        if (item.targetAreaPenalty > item.sourceAreaPenalty + 320) {
          return false;
        }

        if (item.targetNearest > item.sourceNearest + 6) {
          return false;
        }

        if (item.targetCost > item.sourceCost + 12 && countGap <= maxAllowedCountGap + 2) {
          return false;
        }

        return true;
      });

    if (!candidate) {
      break;
    }

    moveAssignmentToManager(candidate.assignment, underloaded.managerId, "distribution_rebalanced");
  }

  if (input.forceEqualCheckins) {
    const minimumTarget = Math.floor(totalCheckins / input.availableManagers.length);
    const managersByCurrentLoad = input.availableManagers
      .map((manager) => ({
        managerId: manager.id,
        count: (assignmentsByManager.get(manager.id) ?? []).length,
      }))
      .sort((left, right) => right.count - left.count);
    const extraSlots = totalCheckins % input.availableManagers.length;
    const targetCountByManager = new Map<string, number>();

    managersByCurrentLoad.forEach((item, index) => {
      targetCountByManager.set(item.managerId, minimumTarget + (index < extraSlots ? 1 : 0));
    });

    for (let pass = 0; pass < 40; pass += 1) {
      const managerLoads = input.availableManagers
        .map((manager) => ({
          managerId: manager.id,
          assignments: assignmentsByManager.get(manager.id) ?? [],
          targetCount: targetCountByManager.get(manager.id) ?? minimumTarget,
        }))
        .sort((left, right) => right.assignments.length - left.assignments.length);

      const overloaded = managerLoads.find((item) => item.assignments.length > item.targetCount);
      const underloaded = [...managerLoads]
        .reverse()
        .find((item) => item.assignments.length < item.targetCount);

      if (!overloaded || !underloaded) {
        break;
      }

      const overloadedManager =
        input.availableManagers.find((manager) => manager.id === overloaded.managerId) ?? null;
      const underloadedManager =
        input.availableManagers.find((manager) => manager.id === underloaded.managerId) ?? null;

      if (!overloadedManager || !underloadedManager) {
        break;
      }

      const overloadedAssignments = assignmentsByManager.get(overloaded.managerId) ?? [];
      const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.managerId);

      const resortBlockCandidate = overloadedAssignments
        .map((assignment) => {
          const checkin = getAssignmentCheckin(assignment);
          if (!checkin) {
            return null;
          }

          const resortKey = getResortGroupKey(checkin);
          const resortCount = resortCheckinCounts.get(resortKey) ?? 0;

          if (resortCount >= SMALL_RESORT_LOCK_THRESHOLD) {
            return null;
          }

          const blockAssignments = overloadedAssignments.filter((candidateAssignment) => {
            const candidateCheckin = getAssignmentCheckin(candidateAssignment);
            return candidateCheckin && getResortGroupKey(candidateCheckin) === resortKey;
          });

          const uniqueBlockAssignments = Array.from(
            new Map(blockAssignments.map((item) => [item.checkinId, item])).values(),
          );
          const blockSize = uniqueBlockAssignments.length;

          if (
            blockSize === 0 ||
            overloaded.assignments.length - blockSize < overloaded.targetCount ||
            underloaded.assignments.length + blockSize > underloaded.targetCount
          ) {
            return null;
          }

          const blockOfficeIds = new Set(
            uniqueBlockAssignments
              .map(getAssignmentCheckin)
              .map((item) => item?.condominium?.officeId ?? null)
              .filter((value): value is string => Boolean(value)),
          );

          if (
            input.preventMixedCondominiumOffices &&
            blockOfficeIds.size > 0 &&
            underloadedOfficeIds.size > 0 &&
            [...blockOfficeIds].some((officeId) => !underloadedOfficeIds.has(officeId))
          ) {
            return null;
          }

          const blockPoints = uniqueBlockAssignments
            .map(getAssignmentCheckin)
            .map((item) => (item ? getCheckinPoint(item) : null))
            .filter((value): value is { lat: number; lng: number } => Boolean(value));

          const blockPoint = getPointsCentroid(blockPoints);
          const sourcePoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
          const targetPoints = getManagerAssignedPoints(underloaded.managerId);
          const sourceCost = estimateInsertionCost(
            blockPoint,
            getManagerOriginPoint(overloadedManager, sourcePoints),
            sourcePoints,
          );
          const targetCost = estimateInsertionCost(
            blockPoint,
            getManagerOriginPoint(underloadedManager, targetPoints),
            targetPoints,
          );

          return {
            assignments: uniqueBlockAssignments,
            penalty: targetCost - sourceCost,
          };
        })
        .filter(
          (
            item,
          ): item is {
            assignments: PlannedAssignment[];
            penalty: number;
          } => Boolean(item),
        )
        .sort((left, right) => left.penalty - right.penalty)[0];

      if (resortBlockCandidate) {
        moveAssignmentsGroupToManager(
          resortBlockCandidate.assignments,
          underloaded.managerId,
          "distribution_rebalanced",
        );
        continue;
      }

      const singleCandidate = overloadedAssignments
        .map((assignment) => {
          const checkin = getAssignmentCheckin(assignment);
          const point = checkin ? getCheckinPoint(checkin) : null;

          if (!checkin || !point) {
            return null;
          }

          const resortCount = resortCheckinCounts.get(getResortGroupKey(checkin)) ?? 0;
          if (resortCount < SMALL_RESORT_LOCK_THRESHOLD) {
            return null;
          }

          const checkinOfficeId = checkin.condominium?.officeId ?? null;
          if (
            input.preventMixedCondominiumOffices &&
            checkinOfficeId &&
            underloadedOfficeIds.size > 0 &&
            !underloadedOfficeIds.has(checkinOfficeId)
          ) {
            return null;
          }

          const sourcePoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
          const targetPoints = getManagerAssignedPoints(underloaded.managerId);
          const sourceOrigin = getManagerOriginPoint(overloadedManager, sourcePoints);
          const targetOrigin = getManagerOriginPoint(underloadedManager, targetPoints);
          const sourceCost = estimateInsertionCost(point, sourceOrigin, sourcePoints);
          const targetCost = estimateInsertionCost(point, targetOrigin, targetPoints);
          const sourceNearest = getNearestDistanceToAnyPoint(point, sourcePoints) ?? sourceCost;
          const targetNearest = getNearestDistanceToAnyPoint(point, targetPoints) ?? targetCost;

          return {
            assignment,
            penalty: (targetCost - sourceCost) * 12 + (targetNearest - sourceNearest) * 18,
          };
        })
        .filter(
          (
            item,
          ): item is {
            assignment: PlannedAssignment;
            penalty: number;
          } => Boolean(item),
        )
        .sort((left, right) => left.penalty - right.penalty)[0];

      if (!singleCandidate) {
        const forcedSingleCandidate = overloadedAssignments
          .map((assignment) => {
            const checkin = getAssignmentCheckin(assignment);
            const point = checkin ? getCheckinPoint(checkin) : null;

            if (!checkin || !point) {
              return null;
            }

            const resortCount = resortCheckinCounts.get(getResortGroupKey(checkin)) ?? 0;
            if (resortCount < SMALL_RESORT_LOCK_THRESHOLD) {
              return null;
            }

            const checkinOfficeId = checkin.condominium?.officeId ?? null;
            if (
              input.preventMixedCondominiumOffices &&
              checkinOfficeId &&
              underloadedOfficeIds.size > 0 &&
              !underloadedOfficeIds.has(checkinOfficeId)
            ) {
              return null;
            }

            const sourcePoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
            const targetPoints = getManagerAssignedPoints(underloaded.managerId);
            const sourceOrigin = getManagerOriginPoint(overloadedManager, sourcePoints);
            const targetOrigin = getManagerOriginPoint(underloadedManager, targetPoints);
            const sourceCost = estimateInsertionCost(point, sourceOrigin, sourcePoints);
            const targetCost = estimateInsertionCost(point, targetOrigin, targetPoints);
            const sourceNearest = getNearestDistanceToAnyPoint(point, sourcePoints) ?? sourceCost;
            const targetNearest = getNearestDistanceToAnyPoint(point, targetPoints) ?? targetCost;
            const penalty = (targetCost - sourceCost) * 10 + (targetNearest - sourceNearest) * 12;

            return {
              assignment,
              penalty,
            };
          })
          .filter(
            (
              item,
            ): item is {
              assignment: PlannedAssignment;
              penalty: number;
            } => Boolean(item),
          )
          .sort((left, right) => left.penalty - right.penalty)[0];

        if (!forcedSingleCandidate) {
          break;
        }

        moveAssignmentToManager(
          forcedSingleCandidate.assignment,
          underloaded.managerId,
          "distribution_rebalanced",
        );
        continue;
      }

      moveAssignmentToManager(
        singleCandidate.assignment,
        underloaded.managerId,
        "distribution_rebalanced",
      );
    }

    for (let pass = 0; pass < 40; pass += 1) {
      const managerLoads = input.availableManagers
        .map((manager) => ({
          managerId: manager.id,
          assignments: assignmentsByManager.get(manager.id) ?? [],
        }))
        .sort((left, right) => right.assignments.length - left.assignments.length);

      const overloaded = managerLoads[0];
      if (!overloaded) {
        break;
      }

      const underloadedCandidates = managerLoads
        .slice(1)
        .reverse()
        .filter((candidate) => overloaded.assignments.length - candidate.assignments.length > forcedEqualTargetGap);

      if (underloadedCandidates.length === 0) {
        break;
      }

      const overloadedManager =
        input.availableManagers.find((manager) => manager.id === overloaded.managerId) ?? null;
      if (!overloadedManager) {
        break;
      }

      let moveApplied = false;

      for (const underloaded of underloadedCandidates) {
        const underloadedManager =
          input.availableManagers.find((manager) => manager.id === underloaded.managerId) ?? null;

        if (!underloadedManager) {
          continue;
        }

        const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.managerId);
        const candidate = overloaded.assignments
          .map((assignment) => {
            const checkin = getAssignmentCheckin(assignment);
            const point = checkin ? getCheckinPoint(checkin) : null;

            if (!checkin || !point) {
              return null;
            }

            const resortCount = resortCheckinCounts.get(getResortGroupKey(checkin)) ?? 0;
            if (resortCount < SMALL_RESORT_LOCK_THRESHOLD) {
              return null;
            }

            const checkinOfficeId = checkin.condominium?.officeId ?? null;
            if (
              input.preventMixedCondominiumOffices &&
              checkinOfficeId &&
              underloadedOfficeIds.size > 0 &&
              !underloadedOfficeIds.has(checkinOfficeId)
            ) {
              return null;
            }

            const sourcePoints = getManagerAssignedPoints(overloaded.managerId, assignment.checkinId);
            const targetPoints = getManagerAssignedPoints(underloaded.managerId);
            const sourceCost = estimateInsertionCost(
              point,
              getManagerOriginPoint(overloadedManager, sourcePoints),
              sourcePoints,
            );
            const targetCost = estimateInsertionCost(
              point,
              getManagerOriginPoint(underloadedManager, targetPoints),
              targetPoints,
            );
            const sourceNearest = getNearestDistanceToAnyPoint(point, sourcePoints) ?? sourceCost;
            const targetNearest = getNearestDistanceToAnyPoint(point, targetPoints) ?? targetCost;

            return {
              assignment,
              score: (targetCost - sourceCost) * 8 + (targetNearest - sourceNearest) * 10,
            };
          })
          .filter(
            (
              item,
            ): item is {
              assignment: PlannedAssignment;
              score: number;
            } => Boolean(item),
          )
          .sort((left, right) => left.score - right.score)[0];

        if (!candidate) {
          continue;
        }

        moveAssignmentToManager(candidate.assignment, underloaded.managerId, "distribution_rebalanced");
        moveApplied = true;
        break;
      }

      if (!moveApplied) {
        break;
      }
    }
  }

  for (const [managerId, assignments] of assignmentsByManager) {
    const sortedAssignments = assignments.sort((left, right) => {
      const leftCheckin = input.checkins.find((checkin) => checkin.id === left.checkinId);
      const rightCheckin = input.checkins.find((checkin) => checkin.id === right.checkinId);

      return (
        (leftCheckin?.condominiumName ?? "").localeCompare(rightCheckin?.condominiumName ?? "") ||
        (leftCheckin?.address ?? "").localeCompare(rightCheckin?.address ?? "") ||
        (leftCheckin?.propertyName ?? "").localeCompare(rightCheckin?.propertyName ?? "")
      );
    });

    sortedAssignments.forEach((assignment, index) => {
      assignment.routeOrder = index + 1;
    });

    assignmentsByManager.set(managerId, sortedAssignments);
  }

  return plannedAssignments;
}

export function enforceEqualCheckinCounts(
  plan: PlannedAssignment[],
  input: PlanInput,
  maxGap?: number,
) {
  if (!input.forceEqualCheckins || input.availableManagers.length <= 1) {
    return plan;
  }

  const resolvedMaxGap = maxGap ?? getForceEqualTargetGap(input.checkins.length, input.availableManagers.length);

  const checkinById = new Map(input.checkins.map((checkin) => [checkin.id, checkin]));
  const resortCheckinCounts = getResortCheckinCounts(input.checkins);
  const assignmentsByManager = new Map<string, PlannedAssignment[]>();

  for (const manager of input.availableManagers) {
    assignmentsByManager.set(manager.id, []);
  }

  for (const assignment of plan) {
    const existing = assignmentsByManager.get(assignment.propertyManagerId) ?? [];
    existing.push(assignment);
    assignmentsByManager.set(assignment.propertyManagerId, existing);
  }

  function getAssignmentCheckin(assignment: PlannedAssignment) {
    return checkinById.get(assignment.checkinId) ?? null;
  }

  function getManagerAssignedPoints(managerId: string, excludingAssignmentId?: string) {
    return (assignmentsByManager.get(managerId) ?? [])
      .filter((assignment) => assignment.checkinId !== excludingAssignmentId)
      .map(getAssignmentCheckin)
      .filter((value): value is CheckinInput => Boolean(value))
      .map(getCheckinPoint)
      .filter((value): value is { lat: number; lng: number } => Boolean(value));
  }

  function getManagerAssignedCondominiumOfficeIds(managerId: string, excludingAssignmentId?: string) {
    const officeIds = new Set(
      (assignmentsByManager.get(managerId) ?? [])
        .filter((assignment) => assignment.checkinId !== excludingAssignmentId)
        .map(getAssignmentCheckin)
        .map((checkin) => checkin?.condominium?.officeId ?? null)
        .filter((value): value is string => Boolean(value)),
    );

    const managerOfficeId =
      input.availableManagers.find((manager) => manager.id === managerId)?.officeId ?? null;

    if (managerOfficeId) {
      officeIds.add(managerOfficeId);
    }

    return officeIds;
  }

  function moveAssignment(assignment: PlannedAssignment, targetManagerId: string) {
    if (assignment.propertyManagerId === targetManagerId) {
      return;
    }

    assignmentsByManager.set(
      assignment.propertyManagerId,
      (assignmentsByManager.get(assignment.propertyManagerId) ?? []).filter(
        (item) => item.checkinId !== assignment.checkinId,
      ),
    );

    const targetAssignments = assignmentsByManager.get(targetManagerId) ?? [];
    targetAssignments.push(assignment);
    assignmentsByManager.set(targetManagerId, targetAssignments);

    assignment.propertyManagerId = targetManagerId;
    if (assignment.source !== "default_pm") {
      assignment.source = "distribution_rebalanced";
    }
  }

  function moveAssignments(assignments: PlannedAssignment[], targetManagerId: string) {
    for (const assignment of assignments) {
      moveAssignment(assignment, targetManagerId);
    }
  }

  for (let pass = 0; pass < 80; pass += 1) {
    const managerLoads = input.availableManagers
      .map((manager) => ({
        manager,
        assignments: assignmentsByManager.get(manager.id) ?? [],
      }))
      .sort((left, right) => right.assignments.length - left.assignments.length);

    let moveApplied = false;

    for (const overloaded of managerLoads) {
      const underloadedCandidates = managerLoads
        .filter((candidate) => candidate.manager.id !== overloaded.manager.id)
        .reverse()
        .filter((candidate) => overloaded.assignments.length - candidate.assignments.length > resolvedMaxGap);

      if (underloadedCandidates.length === 0) {
        continue;
      }

      for (const underloaded of underloadedCandidates) {
        const currentGap = overloaded.assignments.length - underloaded.assignments.length;
        const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.manager.id);

        const groupedByResort = new Map<string, PlannedAssignment[]>();
        for (const assignment of overloaded.assignments) {
          const checkin = getAssignmentCheckin(assignment);
          if (!checkin) {
            continue;
          }
          const resortKey = getResortGroupKey(checkin);
          const bucket = groupedByResort.get(resortKey) ?? [];
          bucket.push(assignment);
          groupedByResort.set(resortKey, bucket);
        }

        const blockCandidate = [...groupedByResort.entries()]
          .map(([resortKey, assignments]) => {
            const sampleCheckin = getAssignmentCheckin(assignments[0]!);
            if (!sampleCheckin) {
              return null;
            }

            const resortCount = resortCheckinCounts.get(resortKey) ?? assignments.length;
            if (resortCount >= SMALL_RESORT_LOCK_THRESHOLD) {
              return null;
            }

            const newGap = Math.abs(
              overloaded.assignments.length - assignments.length - (underloaded.assignments.length + assignments.length),
            );

            if (newGap >= currentGap) {
              return null;
            }

            const blockOfficeIds = new Set(
              assignments
                .map(getAssignmentCheckin)
                .map((checkin) => checkin?.condominium?.officeId ?? null)
                .filter((value): value is string => Boolean(value)),
            );

            if (
              input.preventMixedCondominiumOffices &&
              blockOfficeIds.size > 0 &&
              underloadedOfficeIds.size > 0 &&
              [...blockOfficeIds].some((officeId) => !underloadedOfficeIds.has(officeId))
            ) {
              return null;
            }

            const blockPoint = getPointsCentroid(
              assignments
                .map(getAssignmentCheckin)
                .map((checkin) => (checkin ? getCheckinPoint(checkin) : null))
                .filter((value): value is { lat: number; lng: number } => Boolean(value)),
            );

            const overloadedOrigin = getManagerOriginPoint(
              overloaded.manager,
              getManagerAssignedPoints(overloaded.manager.id, assignments[0]?.checkinId),
            );
            const underloadedOrigin = getManagerOriginPoint(
              underloaded.manager,
              getManagerAssignedPoints(underloaded.manager.id),
            );

            const score =
              estimateInsertionCost(
                blockPoint,
                underloadedOrigin,
                getManagerAssignedPoints(underloaded.manager.id),
              ) -
              estimateInsertionCost(
                blockPoint,
                overloadedOrigin,
                getManagerAssignedPoints(overloaded.manager.id, assignments[0]?.checkinId),
              );

            return { assignments, score };
          })
          .filter(
            (
              item,
            ): item is {
              assignments: PlannedAssignment[];
              score: number;
            } => Boolean(item),
          )
          .sort((left, right) => left.score - right.score)[0];

        if (blockCandidate) {
          moveAssignments(blockCandidate.assignments, underloaded.manager.id);
          moveApplied = true;
          break;
        }

        const singleCandidate = overloaded.assignments
          .map((assignment) => {
            const checkin = getAssignmentCheckin(assignment);
            const point = checkin ? getCheckinPoint(checkin) : null;

            if (!checkin || !point) {
              return null;
            }

            const resortCount = resortCheckinCounts.get(getResortGroupKey(checkin)) ?? 0;
            if (resortCount < SMALL_RESORT_LOCK_THRESHOLD) {
              return null;
            }

            const checkinOfficeId = checkin.condominium?.officeId ?? null;
            if (
              input.preventMixedCondominiumOffices &&
              checkinOfficeId &&
              underloadedOfficeIds.size > 0 &&
              !underloadedOfficeIds.has(checkinOfficeId)
            ) {
              return null;
            }

            const sourcePoints = getManagerAssignedPoints(overloaded.manager.id, assignment.checkinId);
            const targetPoints = getManagerAssignedPoints(underloaded.manager.id);
            const sourceCost = estimateInsertionCost(
              point,
              getManagerOriginPoint(overloaded.manager, sourcePoints),
              sourcePoints,
            );
            const targetCost = estimateInsertionCost(
              point,
              getManagerOriginPoint(underloaded.manager, targetPoints),
              targetPoints,
            );
            const sourceNearest = getNearestDistanceToAnyPoint(point, sourcePoints) ?? sourceCost;
            const targetNearest = getNearestDistanceToAnyPoint(point, targetPoints) ?? targetCost;
            const newGap = Math.abs(
              overloaded.assignments.length - 1 - (underloaded.assignments.length + 1),
            );

            if (newGap >= currentGap) {
              return null;
            }

            return {
              assignment,
              score: (targetCost - sourceCost) * 8 + (targetNearest - sourceNearest) * 10,
            };
          })
          .filter(
            (
              item,
            ): item is {
              assignment: PlannedAssignment;
              score: number;
            } => Boolean(item),
          )
          .sort((left, right) => left.score - right.score)[0];

        if (!singleCandidate) {
          continue;
        }

        moveAssignment(singleCandidate.assignment, underloaded.manager.id);
        moveApplied = true;
        break;
      }

      if (moveApplied) {
        break;
      }
    }

    if (!moveApplied) {
      break;
    }
  }

  for (let pass = 0; pass < 120; pass += 1) {
    const managerLoads = input.availableManagers
      .map((manager) => ({
        manager,
        assignments: assignmentsByManager.get(manager.id) ?? [],
      }))
      .sort((left, right) => right.assignments.length - left.assignments.length);

    let moveApplied = false;

    for (const overloaded of managerLoads) {
      const underloadedCandidates = managerLoads
        .filter((candidate) => candidate.manager.id !== overloaded.manager.id)
        .reverse()
        .filter((candidate) => overloaded.assignments.length - candidate.assignments.length > resolvedMaxGap);

      if (underloadedCandidates.length === 0) {
        continue;
      }

      for (const underloaded of underloadedCandidates) {
        const underloadedOfficeIds = getManagerAssignedCondominiumOfficeIds(underloaded.manager.id);

        const forcedCandidate = overloaded.assignments
          .map((assignment) => {
            const checkin = getAssignmentCheckin(assignment);
            if (!checkin) {
              return null;
            }

            const resortCount = resortCheckinCounts.get(getResortGroupKey(checkin)) ?? 0;
            if (resortCount < SMALL_RESORT_LOCK_THRESHOLD) {
              return null;
            }

            const checkinOfficeId = checkin.condominium?.officeId ?? null;
            if (
              input.preventMixedCondominiumOffices &&
              checkinOfficeId &&
              underloadedOfficeIds.size > 0 &&
              !underloadedOfficeIds.has(checkinOfficeId)
            ) {
              return null;
            }

            const sameResortInSource = (assignmentsByManager.get(overloaded.manager.id) ?? []).filter((item) => {
              const candidateCheckin = getAssignmentCheckin(item);
              return candidateCheckin && getResortGroupKey(candidateCheckin) === getResortGroupKey(checkin);
            }).length;

            const sameResortInTarget = (assignmentsByManager.get(underloaded.manager.id) ?? []).filter((item) => {
              const candidateCheckin = getAssignmentCheckin(item);
              return candidateCheckin && getResortGroupKey(candidateCheckin) === getResortGroupKey(checkin);
            }).length;

            const point = getCheckinPoint(checkin);
            const targetPoints = getManagerAssignedPoints(underloaded.manager.id);
            const targetNearest = point ? getNearestDistanceToAnyPoint(point, targetPoints) ?? 0 : 0;

            return {
              assignment,
              priority:
                sameResortInTarget * 100 -
                sameResortInSource * 10 -
                targetNearest,
            };
          })
          .filter(
            (
              item,
            ): item is {
              assignment: PlannedAssignment;
              priority: number;
            } => Boolean(item),
          )
          .sort((left, right) => right.priority - left.priority)[0];

        if (!forcedCandidate) {
          continue;
        }

        moveAssignment(forcedCandidate.assignment, underloaded.manager.id);
        moveApplied = true;
        break;
      }

      if (moveApplied) {
        break;
      }
    }

    if (!moveApplied) {
      break;
    }
  }

  for (const [managerId, assignments] of assignmentsByManager) {
    const sortedAssignments = assignments.sort((left, right) => {
      const leftCheckin = getAssignmentCheckin(left);
      const rightCheckin = getAssignmentCheckin(right);

      return (
        (leftCheckin?.condominiumName ?? "").localeCompare(rightCheckin?.condominiumName ?? "") ||
        (leftCheckin?.address ?? "").localeCompare(rightCheckin?.address ?? "") ||
        (leftCheckin?.propertyName ?? "").localeCompare(rightCheckin?.propertyName ?? "")
      );
    });

    sortedAssignments.forEach((assignment, index) => {
      assignment.routeOrder = index + 1;
    });

    assignmentsByManager.set(managerId, sortedAssignments);
  }

  return plan;
}
