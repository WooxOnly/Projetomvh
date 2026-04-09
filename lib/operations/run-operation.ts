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

type RunOperationInput = {
  spreadsheetUploadId: string;
  decisionMode: "default" | "override";
  availablePropertyManagerIds?: string[];
  preventMixedCondominiumOffices?: boolean;
  forceEqualCheckins?: boolean;
  endRouteNearOffice?: boolean;
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
      forceEqualCheckins: input.forceEqualCheckins ?? true,
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
            forceEqualCheckins: input.forceEqualCheckins ?? true,
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
      forceEqualCheckins: input.forceEqualCheckins ?? true,
    },
  );

  const expiresAt = getExpiryDate(upload.operationDate);

  const operationRun = await prisma.operationRun.create({
    data: {
      spreadsheetUploadId: upload.id,
      operationDate: upload.operationDate,
      decisionMode: input.decisionMode,
      preventMixedCondominiumOffices: input.preventMixedCondominiumOffices ?? true,
      forceEqualCheckins: input.forceEqualCheckins ?? true,
      endRouteNearOffice: input.endRouteNearOffice ?? true,
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

  if (input.useHereRouting && hasHereRoutingApiKey()) {
    const usedHereResequencing = await resequenceOperationRunWithHere(operationRun.id);

    if (!usedHereResequencing) {
      await resequenceOperationRun(operationRun.id);
    }
  } else {
    await resequenceOperationRun(operationRun.id);
  }

  return operationRun;
}

export async function refreshOperationRunRouting(operationRunId: string) {
  await prisma.operationRun.update({
    where: {
      id: operationRunId,
    },
    data: {
      routeAnalysisJson: null,
      routeAnalysisSource: null,
      routeAnalysisModel: null,
      routeAnalysisGeneratedAt: null,
    },
  });

  await resequenceOperationRun(operationRunId);
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
  const operationRun = await prisma.operationRun.findUnique({
    where: {
      id: operationRunId,
    },
    select: {
      endRouteNearOffice: true,
    },
  });

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
    Array.from(byManager.values()).flatMap((managerAssignments) => {
      const sortedAssignments = sortAssignmentsForRoute(managerAssignments);
      const effectiveAssignments = operationRun?.endRouteNearOffice
        ? [...sortedAssignments].reverse()
        : sortedAssignments;

      return effectiveAssignments.map((assignment, index) =>
        prisma.operationAssignment.update({
          where: {
            id: assignment.id,
          },
          data: {
            routeOrder: index + 1,
          },
        }),
      );
    }),
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

  await finalizeOperationRunAssignmentChanges(assignment.operationRunId);

  return assignment;
}

async function finalizeOperationRunAssignmentChanges(operationRunId: string) {
  await prisma.operationRun.update({
    where: {
      id: operationRunId,
    },
    data: {
      routeAnalysisJson: null,
      routeAnalysisSource: null,
      routeAnalysisModel: null,
      routeAnalysisGeneratedAt: null,
    },
  });

  if (hasHereRoutingApiKey()) {
    const usedHereResequencing = await resequenceOperationRunWithHere(operationRunId);

    if (!usedHereResequencing) {
      await resequenceOperationRun(operationRunId);
    }
  } else {
    await resequenceOperationRun(operationRunId);
  }
}

async function applyOperationAssignmentBatch(
  operationRunId: string,
  updates: Array<{ assignmentId: string; checkinId: string; propertyManagerId: string }>,
) {
  if (updates.length === 0) {
    return;
  }

  await prisma.$transaction([
    ...updates.map((update) =>
      prisma.operationAssignment.update({
        where: {
          id: update.assignmentId,
        },
        data: {
          propertyManagerId: update.propertyManagerId,
          source: "manual_override",
        },
      }),
    ),
    ...updates.map((update) =>
      prisma.checkin.update({
        where: {
          id: update.checkinId,
        },
        data: {
          propertyManagerId: update.propertyManagerId,
          status: "assigned",
        },
      }),
    ),
  ]);

  await finalizeOperationRunAssignmentChanges(operationRunId);
}

export async function swapOperationManagerRoutes(input: {
  operationRunId: string;
  firstPropertyManagerId: string;
  secondPropertyManagerId: string;
}) {
  if (input.firstPropertyManagerId === input.secondPropertyManagerId) {
    throw new Error("Selecione dois PMs diferentes para trocar a rota completa.");
  }

  const assignments = await prisma.operationAssignment.findMany({
    where: {
      operationRunId: input.operationRunId,
      propertyManagerId: {
        in: [input.firstPropertyManagerId, input.secondPropertyManagerId],
      },
    },
    select: {
      id: true,
      checkinId: true,
      propertyManagerId: true,
    },
  });

  const hasFirstManager = assignments.some(
    (assignment) => assignment.propertyManagerId === input.firstPropertyManagerId,
  );
  const hasSecondManager = assignments.some(
    (assignment) => assignment.propertyManagerId === input.secondPropertyManagerId,
  );

  if (!hasFirstManager || !hasSecondManager) {
    throw new Error("Os dois PMs precisam ter rota nesta operação para permitir a troca completa.");
  }

  const updates = assignments.map((assignment) => ({
    assignmentId: assignment.id,
    checkinId: assignment.checkinId,
    propertyManagerId:
      assignment.propertyManagerId === input.firstPropertyManagerId
        ? input.secondPropertyManagerId
        : input.firstPropertyManagerId,
  }));

  await applyOperationAssignmentBatch(input.operationRunId, updates);
}

export async function rebalanceOperationManagerRoutes(input: {
  operationRunId: string;
  firstPropertyManagerId: string;
  secondPropertyManagerId: string;
  assignmentIdsToFirstManager: string[];
  assignmentIdsToSecondManager: string[];
}) {
  if (input.firstPropertyManagerId === input.secondPropertyManagerId) {
    throw new Error("Selecione dois PMs diferentes para ajustar as rotas.");
  }

  const assignmentIds = Array.from(
    new Set([...input.assignmentIdsToFirstManager, ...input.assignmentIdsToSecondManager]),
  );

  if (assignmentIds.length === 0) {
    throw new Error("Selecione pelo menos um check-in para ajustar entre as rotas.");
  }

  const assignments = await prisma.operationAssignment.findMany({
    where: {
      operationRunId: input.operationRunId,
      id: {
        in: assignmentIds,
      },
    },
    select: {
      id: true,
      checkinId: true,
      propertyManagerId: true,
    },
  });

  if (assignments.length !== assignmentIds.length) {
    throw new Error("Alguns check-ins selecionados não pertencem mais à operação atual.");
  }

  const assignmentsToFirstManager = new Set(input.assignmentIdsToFirstManager);
  const assignmentsToSecondManager = new Set(input.assignmentIdsToSecondManager);

  const updates = assignments.map((assignment) => {
    const shouldMoveToFirstManager = assignmentsToFirstManager.has(assignment.id);
    const shouldMoveToSecondManager = assignmentsToSecondManager.has(assignment.id);

    if (shouldMoveToFirstManager && shouldMoveToSecondManager) {
      throw new Error("O mesmo check-in não pode ser enviado para os dois PMs.");
    }

    if (!shouldMoveToFirstManager && !shouldMoveToSecondManager) {
      throw new Error("Foi encontrado um check-in sem destino definido no ajuste em lote.");
    }

    const expectedCurrentManagerId = shouldMoveToFirstManager
      ? input.secondPropertyManagerId
      : input.firstPropertyManagerId;
    const targetManagerId = shouldMoveToFirstManager
      ? input.firstPropertyManagerId
      : input.secondPropertyManagerId;

    if (assignment.propertyManagerId !== expectedCurrentManagerId) {
      throw new Error("Um ou mais check-ins já mudaram de PM. Atualize a tela e tente novamente.");
    }

    return {
      assignmentId: assignment.id,
      checkinId: assignment.checkinId,
      propertyManagerId: targetManagerId,
    };
  });

  await applyOperationAssignmentBatch(input.operationRunId, updates);
}
