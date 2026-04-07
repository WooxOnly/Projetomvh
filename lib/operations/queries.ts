import "server-only";

import { prisma } from "@/lib/prisma";
import { countPendingLocationReviews } from "@/lib/location-review";
import { listOffices } from "@/lib/offices";
import { cleanupExpiredOperationalData } from "@/lib/operations/cleanup";
import { ensureOperationRouteCoordinates } from "@/lib/operations/route-geocoding";
import { listCondominiums, listProperties, listPropertyManagers } from "@/lib/operations/catalog";
import {
  getActiveUploadOfficeBreakdown,
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

  return {
    runs,
    totalRuns: runs.length,
    totalCondominiumsImproved: runs.reduce(
      (total, run) => total + Math.max(0, run.condominiumsMissingBefore - run.condominiumsMissingAfter),
      0,
    ),
    totalPropertiesImproved: runs.reduce(
      (total, run) => total + Math.max(0, run.propertiesMissingBefore - run.propertiesMissingAfter),
      0,
    ),
    totalCheckinsImproved: runs.reduce(
      (total, run) => total + Math.max(0, run.checkinsMissingBefore - run.checkinsMissingAfter),
      0,
    ),
    latestRunAt: runs[0]?.createdAt ?? null,
  };
}

async function getLatestOperationRunBase(options?: { ensureCoordinates?: boolean }) {
  const latestRun = await prisma.operationRun.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
    },
  });

  if (!latestRun) {
    return null;
  }

  if (options?.ensureCoordinates !== false) {
    await ensureOperationRouteCoordinates(latestRun.id);
  }

  return prisma.operationRun.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      operationDate: true,
      decisionMode: true,
      preventMixedCondominiumOffices: true,
      forceEqualCheckins: true,
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
  return getLatestOperationRunBase({ ensureCoordinates: true });
}

export async function getLatestOperationRunForExport() {
  return getLatestOperationRunBase({ ensureCoordinates: false });
}

export async function getDashboardSnapshot() {
  await cleanupExpiredOperationalData();

  const [
    propertyManagers,
    condominiums,
    properties,
    offices,
    activeUpload,
    activeUploadOfficeBreakdown,
    uploadHistory,
    latestOperationRun,
    pendingLocationReviews,
    weeklyLocationMaintenance,
  ] = await Promise.all([
    listPropertyManagers(),
    listCondominiums(),
    listProperties(),
    listOffices(),
    getActiveUploadSummary(),
    getActiveUploadOfficeBreakdown(),
    getUploadHistory(),
    getLatestOperationRunForExport(),
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
    activeUploadOfficeBreakdown,
    uploadHistory,
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
