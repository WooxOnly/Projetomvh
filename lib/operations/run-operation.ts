import "server-only";

import { prisma } from "@/lib/prisma";
import { cleanupExpiredOperationalData } from "@/lib/operations/cleanup";
import { buildOperationPlan } from "@/lib/operations/ai-distribution";
import {
  enforceEqualCheckinCounts,
  enforceSmallResortSingleManager,
} from "@/lib/operations/distribution";
import {
  hasHereRoutingApiKey,
  optimizePlanWithHere,
  resequenceOperationRunWithHere,
} from "@/lib/operations/here-routing";
import { HERE_ROUTING_NOTE, LOCAL_ROUTING_NOTE } from "@/lib/operations/here-usage";
import { ensureOperationRouteCoordinates } from "@/lib/operations/route-geocoding";

type RunOperationInput = {
  spreadsheetUploadId: string;
  decisionMode: "default" | "override";
  availablePropertyManagerIds?: string[];
  preventMixedCondominiumOffices?: boolean;
  forceEqualCheckins?: boolean;
  useHereRouting?: boolean;
  temporaryOfficeByManagerId?: Record<string, string>;
};

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

type RoutePoint = {
  lat: number;
  lng: number;
};

function getExpiryDate(operationDate: Date) {
  const expiresAt = new Date(operationDate);
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt;
}

export async function runDailyOperation(input: RunOperationInput) {
  await cleanupExpiredOperationalData();

  const upload = await prisma.spreadsheetUpload.findUnique({
    where: {
      id: input.spreadsheetUploadId,
    },
    include: {
      checkins: {
        orderBy: {
          createdAt: "asc",
        },
        include: {
          property: {
            select: {
              defaultPropertyManagerId: true,
            },
          },
          condominium: {
            select: {
              officeId: true,
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  });

  if (!upload) {
    throw new Error("Upload nao encontrado.");
  }

  if (upload.checkins.length === 0) {
    throw new Error("Esse upload nao possui check-ins para distribuir.");
  }

  const availableManagers = await prisma.propertyManager.findMany({
    where: {
      isActive: true,
      ...(input.availablePropertyManagerIds?.length
        ? {
            id: {
              in: input.availablePropertyManagerIds,
            },
          }
        : {}),
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      officeId: true,
      office: {
        select: {
          lat: true,
          lng: true,
        },
      },
    },
  });

  const availableManagerIds = new Set<string>();
  for (const managerRecord of availableManagers) {
    availableManagerIds.add(managerRecord.id);
  }

  const temporaryOfficeEntries: Array<[string, string]> = [];
  for (const [propertyManagerId, officeId] of Object.entries(input.temporaryOfficeByManagerId ?? {})) {
    if (propertyManagerId && officeId && availableManagerIds.has(propertyManagerId)) {
      temporaryOfficeEntries.push([propertyManagerId, officeId]);
    }
  }

  const temporaryOfficeIds: string[] = [];
  for (const [, officeId] of temporaryOfficeEntries) {
    temporaryOfficeIds.push(officeId);
  }

  const temporaryOffices =
    temporaryOfficeEntries.length > 0
      ? await prisma.office.findMany({
          where: {
             id: {
               in: temporaryOfficeIds,
             },
           },
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            lat: true,
            lng: true,
          },
        })
      : [];

  const temporaryOfficeById = new Map();
  for (const officeRecord of temporaryOffices) {
    temporaryOfficeById.set(officeRecord.id, officeRecord);
  }

  const managersForOperation = [];
  for (const managerRecord of availableManagers) {
    const overrideOfficeId = input.temporaryOfficeByManagerId?.[managerRecord.id];
    const overrideOffice = overrideOfficeId ? temporaryOfficeById.get(overrideOfficeId) : null;

    if (!overrideOffice) {
      managersForOperation.push(managerRecord);
      continue;
    }

    managersForOperation.push({
      ...managerRecord,
      officeId: overrideOffice.id,
      office: overrideOffice,
    });
  }

  const basePlan = enforceSmallResortSingleManager(
    await buildOperationPlan({
      checkins: upload.checkins,
      availableManagers: managersForOperation,
      decisionMode: input.decisionMode,
      preventMixedCondominiumOffices: input.preventMixedCondominiumOffices ?? true,
      forceEqualCheckins: input.forceEqualCheckins ?? false,
    }),
    upload.checkins,
  );
  const plan = enforceEqualCheckinCounts(
    enforceSmallResortSingleManager(
    input.useHereRouting
      ? await optimizePlanWithHere(
          {
            checkins: upload.checkins,
            availableManagers: managersForOperation,
            decisionMode: input.decisionMode,
            preventMixedCondominiumOffices: input.preventMixedCondominiumOffices ?? true,
            forceEqualCheckins: input.forceEqualCheckins ?? false,
          },
          basePlan,
        )
      : basePlan,
      upload.checkins,
    ),
    {
      checkins: upload.checkins,
      availableManagers: managersForOperation,
      decisionMode: input.decisionMode,
      preventMixedCondominiumOffices: input.preventMixedCondominiumOffices ?? true,
      forceEqualCheckins: input.forceEqualCheckins ?? false,
    },
  );

  const expiresAt = getExpiryDate(upload.operationDate);

  const operationRun = await prisma.operationRun.create({
    data: {
      spreadsheetUploadId: upload.id,
      operationDate: upload.operationDate,
      decisionMode: input.decisionMode,
      preventMixedCondominiumOffices: input.preventMixedCondominiumOffices ?? true,
      forceEqualCheckins: input.forceEqualCheckins ?? false,
      status: "ready",
      notes: input.useHereRouting ? HERE_ROUTING_NOTE : LOCAL_ROUTING_NOTE,
      routeAnalysisJson: null,
      routeAnalysisSource: null,
      routeAnalysisModel: null,
      routeAnalysisGeneratedAt: null,
      totalCheckins: upload.checkins.length,
      totalAssignments: plan.length,
      expiresAt,
      availablePMs: {
        create: (() => {
          const rows = [];
          for (const managerRecord of managersForOperation) {
            const temporaryOfficeId = input.temporaryOfficeByManagerId?.[managerRecord.id];
            rows.push({
              propertyManagerId: managerRecord.id,
              temporaryOfficeId:
                temporaryOfficeId && temporaryOfficeById.has(temporaryOfficeId)
                  ? temporaryOfficeId
                  : null,
            });
          }
          return rows;
        })(),
      },
      assignments: {
        create: (() => {
          const rows = [];
          for (const assignmentRecord of plan) {
            rows.push({
              checkinId: assignmentRecord.checkinId,
              propertyManagerId: assignmentRecord.propertyManagerId,
              routeOrder: assignmentRecord.routeOrder,
              workload: assignmentRecord.workload,
              clusterLabel: assignmentRecord.clusterLabel,
              source: assignmentRecord.source,
            });
          }
          return rows;
        })(),
      },
    },
    select: {
      id: true,
    },
  });

  await prisma.checkin.updateMany({
    where: {
      id: {
        in: (() => {
          const checkinIds: string[] = [];
          for (const assignmentRecord of plan) {
            checkinIds.push(assignmentRecord.checkinId);
          }
          return checkinIds;
        })(),
      },
    },
    data: {
      status: "assigned",
    },
  });

  await ensureOperationRouteCoordinates(operationRun.id);

  if (input.useHereRouting && hasHereRoutingApiKey()) {
    const usedHereResequencing = await resequenceOperationRunWithHere(operationRun.id);

    if (!usedHereResequencing && !plan.every((assignment) => assignment.source === "ai_distribution")) {
      await resequenceOperationRun(operationRun.id);
    }
  } else if (!plan.every((assignment) => assignment.source === "ai_distribution")) {
    await resequenceOperationRun(operationRun.id);
  }

  return operationRun;
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

function normalizeRouteText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAssignmentBlockKey<T extends RouteSortableAssignment>(assignment: T) {
  const condominium = normalizeRouteText(assignment.checkin.condominiumName);
  if (condominium) {
    return `condominium:${condominium}`;
  }

  const address = normalizeRouteText(assignment.checkin.address);
  if (address) {
    return `address:${address}`;
  }

  const property = normalizeRouteText(assignment.checkin.propertyName);
  if (property) {
    return `property:${property}`;
  }

  return `assignment:${assignment.id}`;
}

function getAssignmentPoint<T extends RouteSortableAssignment>(assignment: T): RoutePoint | null {
  if (assignment.checkin.lat == null || assignment.checkin.lng == null) {
    return null;
  }

  return {
    lat: assignment.checkin.lat,
    lng: assignment.checkin.lng,
  };
}

function getPointsCentroid(points: RoutePoint[]) {
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

function distanceBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
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

function totalRouteDistance<T extends RouteSortableAssignment>(
  assignments: T[],
  origin: { lat: number; lng: number } | null,
) {
  if (assignments.length === 0) {
    return 0;
  }

  let total = 0;
  let previousPoint =
    origin ??
    (assignments[0]
      ? {
          lat: assignments[0].checkin.lat!,
          lng: assignments[0].checkin.lng!,
        }
      : null);

  if (!previousPoint) {
    return 0;
  }

  for (const assignment of assignments) {
    const currentPoint = {
      lat: assignment.checkin.lat!,
      lng: assignment.checkin.lng!,
    };
    total += distanceBetween(previousPoint, currentPoint);
    previousPoint = currentPoint;
  }

  return total;
}

function optimizeRouteTwoOpt<T extends RouteSortableAssignment>(
  assignments: T[],
  origin: { lat: number; lng: number } | null,
) {
  if (assignments.length < 4) {
    return assignments;
  }

  let bestRoute = [...assignments];
  let bestDistance = totalRouteDistance(bestRoute, origin);
  let improved = true;

  while (improved) {
    improved = false;

    for (let start = 1; start < bestRoute.length - 2; start += 1) {
      for (let end = start + 1; end < bestRoute.length - 1; end += 1) {
        const candidate = [
          ...bestRoute.slice(0, start),
          ...bestRoute.slice(start, end + 1).reverse(),
          ...bestRoute.slice(end + 1),
        ];
        const candidateDistance = totalRouteDistance(candidate, origin);

        if (candidateDistance + 0.05 < bestDistance) {
          bestRoute = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

function sortAssignmentsWithinBlock<T extends RouteSortableAssignment>(
  assignments: T[],
  origin: RoutePoint | null,
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
  let currentPoint =
    origin ??
    ({
      lat: remaining[0]!.checkin.lat!,
      lng: remaining[0]!.checkin.lng!,
    } satisfies RoutePoint);

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((assignment, index) => {
      const distance = distanceBetween(currentPoint, {
        lat: assignment.checkin.lat!,
        lng: assignment.checkin.lng!,
      });

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

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

  return [...optimizeRouteTwoOpt(route, origin), ...withoutCoordinates];
}

function sortAssignmentsForRoute<T extends RouteSortableAssignment>(assignments: T[]) {
  const alphabeticallySorted = alphabeticalSort(assignments);
  const officeOriginRecord = alphabeticallySorted.find(
    (assignment) =>
      assignment.propertyManager?.office?.lat != null && assignment.propertyManager?.office?.lng != null,
  )?.propertyManager?.office;
  const officeOrigin =
    officeOriginRecord?.lat != null && officeOriginRecord.lng != null
      ? { lat: officeOriginRecord.lat, lng: officeOriginRecord.lng }
      : null;
  const blocks = Array.from(
    alphabeticallySorted.reduce((groups, assignment) => {
      const key = getAssignmentBlockKey(assignment);
      const current = groups.get(key) ?? [];
      current.push(assignment);
      groups.set(key, current);
      return groups;
    }, new Map<string, T[]>()),
  ).map(([key, blockAssignments]) => ({
    key,
    assignments: sortAssignmentsWithinBlock(blockAssignments, officeOrigin),
    representativePoint: getPointsCentroid(
      blockAssignments
        .map((assignment) => getAssignmentPoint(assignment))
        .filter((value): value is RoutePoint => Boolean(value)),
    ),
  }));

  const blocksWithCoordinates = blocks.filter((block) => block.representativePoint != null);
  const blocksWithoutCoordinates = blocks.filter((block) => block.representativePoint == null);

  if (blocksWithCoordinates.length === 0) {
    return blocks.flatMap((block) => block.assignments);
  }

  const orderedBlocks: Array<(typeof blocksWithCoordinates)[number]> = [];
  const remainingBlocks = [...blocksWithCoordinates];
  let currentPoint =
    officeOrigin ??
    remainingBlocks[0]!.representativePoint ?? { lat: 0, lng: 0 };

  while (remainingBlocks.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    remainingBlocks.forEach((block, index) => {
      const distance = distanceBetween(currentPoint, block.representativePoint!);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    const [nextBlock] = remainingBlocks.splice(bestIndex, 1);

    if (!nextBlock) {
      break;
    }

    orderedBlocks.push(nextBlock);
    const lastCoordinateAssignment = [...nextBlock.assignments]
      .reverse()
      .find((assignment) => assignment.checkin.lat != null && assignment.checkin.lng != null);

    currentPoint = lastCoordinateAssignment
      ? {
          lat: lastCoordinateAssignment.checkin.lat!,
          lng: lastCoordinateAssignment.checkin.lng!,
        }
      : nextBlock.representativePoint!;
  }

  return [...orderedBlocks, ...blocksWithoutCoordinates].flatMap((block) => block.assignments);
}

export async function resequenceOperationRun(operationRunId: string) {
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

  await prisma.$transaction(
    Array.from(byManager.values()).flatMap((managerAssignments) =>
      sortAssignmentsForRoute(managerAssignments).map((assignment, index) =>
        prisma.operationAssignment.update({
          where: {
            id: assignment.id,
          },
          data: {
            routeOrder: index + 1,
          },
        }),
      ),
    ),
  );
}

export async function updateOperationAssignment(
  assignmentId: string,
  input: { propertyManagerId: string },
) {
  const assignment = await prisma.operationAssignment.update({
    where: {
      id: assignmentId,
    },
    data: {
      propertyManagerId: input.propertyManagerId,
      source: "manual_override",
    },
    select: {
      operationRunId: true,
      checkinId: true,
    },
  });

  await prisma.checkin.update({
    where: {
      id: assignment.checkinId,
    },
    data: {
      propertyManagerId: input.propertyManagerId,
      status: "assigned",
    },
  });

  await prisma.operationRun.update({
    where: {
      id: assignment.operationRunId,
    },
    data: {
      routeAnalysisJson: null,
      routeAnalysisSource: null,
      routeAnalysisModel: null,
      routeAnalysisGeneratedAt: null,
    },
  });

  if (hasHereRoutingApiKey()) {
    const usedHereResequencing = await resequenceOperationRunWithHere(assignment.operationRunId);

    if (!usedHereResequencing) {
      await resequenceOperationRun(assignment.operationRunId);
    }
  } else {
    await resequenceOperationRun(assignment.operationRunId);
  }

  return assignment;
}
