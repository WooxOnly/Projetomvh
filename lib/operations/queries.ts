import "server-only";

import { prisma } from "@/lib/prisma";
import { HERE_ROUTING_NOTE, getHereRoutingLockedUntil } from "@/lib/operations/here-usage";
import { countPendingLocationReviews } from "@/lib/location-review";
import { listOffices } from "@/lib/offices";
import { cleanupExpiredOperationalData } from "@/lib/operations/cleanup";
import { listCondominiums, listProperties, listPropertyManagers } from "@/lib/operations/catalog";
import { cleanupUploadInheritedCondominiumCoordinates } from "@/lib/operations/route-geocoding";
import {
  getActiveUploadOfficeBreakdown,
  getActiveUploadReviewData,
  getActiveUploadSummary,
  getUploadHistory,
} from "@/lib/upload/queries";
import { getSpreadsheetUploadSequenceMap } from "@/lib/upload/sequence";

async function getWeeklyLocationMaintenanceSummary() {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const runs = await prisma.locationMaintenanceRun.findMany({
    where: {
      createdAt: {
        gte: since,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      condominiumsMissingBefore: true,
      condominiumsMissingAfter: true,
      propertiesMissingBefore: true,
      propertiesMissingAfter: true,
      checkinsMissingBefore: true,
      checkinsMissingAfter: true,
    },
  });

  let totalCondominiumsImproved = 0;
  let totalPropertiesImproved = 0;
  let totalCheckinsImproved = 0;

  for (const run of runs) {
    totalCondominiumsImproved += Math.max(
      0,
      run.condominiumsMissingBefore - run.condominiumsMissingAfter,
    );
    totalPropertiesImproved += Math.max(
      0,
      run.propertiesMissingBefore - run.propertiesMissingAfter,
    );
    totalCheckinsImproved += Math.max(
      0,
      run.checkinsMissingBefore - run.checkinsMissingAfter,
    );
  }

  return {
    runs,
    totalRuns: runs.length,
    totalCondominiumsImproved,
    totalPropertiesImproved,
    totalCheckinsImproved,
    latestRunAt: runs[0]?.createdAt ?? null,
  };
}

async function getLatestOperationRunBase() {
  const latestRun = await prisma.operationRun.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      spreadsheetUploadId: true,
    },
  });

  if (!latestRun) {
    return null;
  }

  const cleanedInheritedCoordinates = await cleanupUploadInheritedCondominiumCoordinates(
    latestRun.spreadsheetUploadId,
  );

  if (cleanedInheritedCoordinates > 0) {
    console.info(
      "Cleaned inherited condominium coordinates from upload",
      latestRun.spreadsheetUploadId,
      cleanedInheritedCoordinates,
    );
  }

  return prisma.operationRun.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      spreadsheetUploadId: true,
      operationDate: true,
      decisionMode: true,
      preventMixedCondominiumOffices: true,
      forceEqualCheckins: true,
      endRouteNearOffice: true,
      status: true,
      routeAnalysisJson: true,
      routeAnalysisSource: true,
      routeAnalysisModel: true,
      routeAnalysisGeneratedAt: true,
      totalCheckins: true,
      totalAssignments: true,
      createdAt: true,
      spreadsheetUpload: {
        select: {
          id: true,
          fileName: true,
        },
      },
      availablePMs: {
        select: {
          propertyManagerId: true,
          temporaryOfficeId: true,
          temporaryOffice: {
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
          },
          propertyManager: {
            select: {
              id: true,
              name: true,
              officeId: true,
              office: {
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
              },
            },
          },
        },
      },
      assignments: {
        orderBy: [{ propertyManager: { name: "asc" } }, { routeOrder: "asc" }],
        select: {
          id: true,
          routeOrder: true,
          workload: true,
          source: true,
          clusterLabel: true,
          propertyManager: {
            select: {
              id: true,
              name: true,
              officeId: true,
              office: {
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
              },
            },
          },
          checkin: {
            select: {
              id: true,
              condominiumName: true,
              propertyName: true,
              building: true,
              address: true,
              bedroomsSnapshot: true,
              integratorName: true,
              guestName: true,
              numberOfNights: true,
              doorCode: true,
              hasBbqGrill: true,
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  });
}

export async function getLatestOperationRun() {
  return getLatestOperationRunBase();
}

export async function getLatestOperationRunForExport() {
  return getLatestOperationRunBase();
}

export async function getDashboardSnapshot() {
  await cleanupExpiredOperationalData();

  const [
    propertyManagers,
    condominiums,
    properties,
    offices,
    activeUpload,
    activeUploadReview,
    activeUploadOfficeBreakdown,
    uploadHistory,
    latestOperationRun,
    latestHereRoutingRun,
    pendingLocationReviews,
    weeklyLocationMaintenance,
  ] = await Promise.all([
    listPropertyManagers(),
    listCondominiums(),
    listProperties(),
    listOffices(),
    getActiveUploadSummary(),
    getActiveUploadReviewData(),
    getActiveUploadOfficeBreakdown(),
    getUploadHistory(),
    getLatestOperationRunForExport(),
    prisma.operationRun.findFirst({
      where: {
        notes: HERE_ROUTING_NOTE,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    }),
    countPendingLocationReviews(),
    getWeeklyLocationMaintenanceSummary(),
  ]);

  const sequenceMap = await getSpreadsheetUploadSequenceMap();

  return {
    propertyManagers,
    condominiums,
    properties,
    offices,
    activeUpload,
    activeUploadReview,
    activeUploadOfficeBreakdown,
    uploadHistory,
    hereApiLockedUntil: getHereRoutingLockedUntil(latestHereRoutingRun?.createdAt ?? null),
    latestOperationRun: latestOperationRun
      ? {
          ...latestOperationRun,
          spreadsheetUpload: {
            ...latestOperationRun.spreadsheetUpload,
            sequenceNumber: sequenceMap.get(latestOperationRun.spreadsheetUpload.id) ?? null,
          },
        }
      : null,
    pendingLocationReviews,
    weeklyLocationMaintenance,
  };
}

export async function getLatestOperationReportData() {
  const [latestOperationRun, propertyManagers] = await Promise.all([
    getLatestOperationRunForExport(),
    prisma.propertyManager.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        phone: true,
        officeId: true,
        office: {
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
        },
      },
    }),
  ]);

  const sequenceMap = await getSpreadsheetUploadSequenceMap();

  return {
    latestOperationRun: latestOperationRun
      ? {
          ...latestOperationRun,
          spreadsheetUpload: {
            ...latestOperationRun.spreadsheetUpload,
            sequenceNumber: sequenceMap.get(latestOperationRun.spreadsheetUpload.id) ?? null,
          },
        }
      : null,
    propertyManagers,
  };
}
