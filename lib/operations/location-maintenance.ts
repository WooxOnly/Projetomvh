import "server-only";

import {
  getActiveSpreadsheetUploadId,
  getLastLocationMaintenanceAt,
  setLastLocationMaintenanceAt,
} from "@/lib/upload/active-upload";
import {
  auditCheckinLocationData,
  auditPropertyLocationData,
  enrichMissingCheckinLocationData,
  enrichMissingCondominiumLocationData,
  enrichMissingPropertyLocationData,
  enrichUploadLocationData,
  getUploadLocationCoverageSnapshot,
  hasUploadLocationBacklog,
} from "@/lib/operations/route-geocoding";
import { prisma } from "@/lib/prisma";

const DAILY_MAINTENANCE_INTERVAL_MS = 1000 * 60 * 60 * 24;
const ACTIVE_UPLOAD_MAINTENANCE_INTERVAL_MS = 1000 * 60 * 10;
const DEFAULT_PROPERTY_BATCH_SIZE = 250;
const DEFAULT_CHECKIN_BATCH_SIZE = 1000;
const MAX_MAINTENANCE_PASSES_PER_RUN = 6;
const ACTIVE_UPLOAD_CONDOMINIUM_BATCH_SIZE = 18;
const ACTIVE_UPLOAD_PROPERTY_BATCH_SIZE = 60;
const ACTIVE_UPLOAD_CHECKIN_BATCH_SIZE = 180;
const MAX_ACTIVE_UPLOAD_PASSES_PER_RUN = 4;

let maintenancePromise: Promise<void> | null = null;

type LocationCoverageSnapshot = {
  condominiumsMissing: number;
  propertiesMissing: number;
  checkinsMissing: number;
};

function isDue(lastRunAt: Date | null, now = new Date()) {
  if (!lastRunAt) {
    return true;
  }

  return now.getTime() - lastRunAt.getTime() >= DAILY_MAINTENANCE_INTERVAL_MS;
}

async function getLocationCoverageSnapshot(): Promise<LocationCoverageSnapshot> {
  const [condominiumsMissing, propertiesMissing, checkinsMissing] = await Promise.all([
    prisma.condominium.count({
      where: {
        OR: [{ address: null }, { city: null }, { state: null }, { zipCode: null }, { lat: null }, { lng: null }],
      },
    }),
    prisma.property.count({
      where: {
        OR: [{ lat: null }, { lng: null }],
      },
    }),
    prisma.checkin.count({
      where: {
        OR: [{ lat: null }, { lng: null }],
      },
    }),
  ]);

  return {
    condominiumsMissing,
    propertiesMissing,
    checkinsMissing,
  };
}

function hasLocationBacklog(snapshot: LocationCoverageSnapshot) {
  return snapshot.condominiumsMissing > 0 || snapshot.propertiesMissing > 0 || snapshot.checkinsMissing > 0;
}

async function getLastLocationMaintenanceRunAt() {
  const latestRun = await prisma.locationMaintenanceRun.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
    },
  });

  return latestRun?.createdAt ?? null;
}

export async function getLocationCoverageStatus() {
  const [snapshot, lastRunAt] = await Promise.all([
    getLocationCoverageSnapshot(),
    getLastLocationMaintenanceAt(),
  ]);

  return {
    ...snapshot,
    fullyCovered: !hasLocationBacklog(snapshot),
    lastRunAt,
  };
}

export async function runLocationMaintenanceBatch() {
  const before = await getLocationCoverageSnapshot();
  let after = before;
  let previous = before;
  const activeUploadId = await getActiveSpreadsheetUploadId();

  for (let pass = 0; pass < MAX_MAINTENANCE_PASSES_PER_RUN; pass += 1) {
    if (activeUploadId) {
      await enrichUploadLocationData(activeUploadId, {
        condominiumLimit: ACTIVE_UPLOAD_CONDOMINIUM_BATCH_SIZE,
        propertyLimit: ACTIVE_UPLOAD_PROPERTY_BATCH_SIZE,
        checkinLimit: ACTIVE_UPLOAD_CHECKIN_BATCH_SIZE,
        reviewCooldownMinutes: 180,
        candidateWindowMultiplier: 5,
      });
    }

    await enrichMissingCondominiumLocationData();
    await enrichMissingPropertyLocationData(DEFAULT_PROPERTY_BATCH_SIZE);
    await enrichMissingCheckinLocationData(DEFAULT_CHECKIN_BATCH_SIZE);
    await auditPropertyLocationData(DEFAULT_PROPERTY_BATCH_SIZE);
    await auditCheckinLocationData(DEFAULT_CHECKIN_BATCH_SIZE);

    after = await getLocationCoverageSnapshot();

    const improved =
      after.condominiumsMissing < previous.condominiumsMissing ||
      after.propertiesMissing < previous.propertiesMissing ||
      after.checkinsMissing < previous.checkinsMissing;

    if (!improved) {
      break;
    }

    previous = after;

    if (!hasLocationBacklog(after)) {
      break;
    }
  }

  await prisma.locationMaintenanceRun.create({
    data: {
      condominiumsMissingBefore: before.condominiumsMissing,
      condominiumsMissingAfter: after.condominiumsMissing,
      propertiesMissingBefore: before.propertiesMissing,
      propertiesMissingAfter: after.propertiesMissing,
      checkinsMissingBefore: before.checkinsMissing,
      checkinsMissingAfter: after.checkinsMissing,
    },
  });
}

async function runActiveUploadLocationMaintenance(uploadId: string) {
  const before = await getUploadLocationCoverageSnapshot(uploadId);
  let after = before;
  let previous = before;

  for (let pass = 0; pass < MAX_ACTIVE_UPLOAD_PASSES_PER_RUN; pass += 1) {
    await enrichUploadLocationData(uploadId, {
      condominiumLimit: ACTIVE_UPLOAD_CONDOMINIUM_BATCH_SIZE,
      propertyLimit: ACTIVE_UPLOAD_PROPERTY_BATCH_SIZE,
      checkinLimit: ACTIVE_UPLOAD_CHECKIN_BATCH_SIZE,
      reviewCooldownMinutes: 180,
      candidateWindowMultiplier: 5,
    });

    after = await getUploadLocationCoverageSnapshot(uploadId);

    const improved =
      after.condominiumsMissing < previous.condominiumsMissing ||
      after.propertiesMissing < previous.propertiesMissing ||
      after.checkinsMissing < previous.checkinsMissing;

    if (!improved) {
      break;
    }

    previous = after;

    if (!hasLocationBacklog(after)) {
      break;
    }
  }

  await setLastLocationMaintenanceAt(new Date());

  await prisma.locationMaintenanceRun.create({
    data: {
      condominiumsMissingBefore: before.condominiumsMissing,
      condominiumsMissingAfter: after.condominiumsMissing,
      propertiesMissingBefore: before.propertiesMissing,
      propertiesMissingAfter: after.propertiesMissing,
      checkinsMissingBefore: before.checkinsMissing,
      checkinsMissingAfter: after.checkinsMissing,
    },
  });
}

export async function ensureDailyLocationMaintenance(options?: { force?: boolean }) {
  const lastRunAt = await getLastLocationMaintenanceAt();

  if (!options?.force && !isDue(lastRunAt)) {
    return;
  }

  if (!maintenancePromise) {
    maintenancePromise = runLocationMaintenanceBatch().finally(() => {
      maintenancePromise = null;
    });
  }

  await maintenancePromise;
}

export async function ensureActiveUploadLocationMaintenance(options?: {
  force?: boolean;
  uploadId?: string | null;
}) {
  const uploadId = options?.uploadId ?? (await getActiveSpreadsheetUploadId());

  if (!uploadId) {
    return;
  }

  if (!(await hasUploadLocationBacklog(uploadId))) {
    return;
  }

  const lastRunAt = await getLastLocationMaintenanceRunAt();
  const recentlyMaintained =
    lastRunAt != null &&
    Date.now() - lastRunAt.getTime() < ACTIVE_UPLOAD_MAINTENANCE_INTERVAL_MS;

  if (!options?.force && recentlyMaintained) {
    return;
  }

  if (!maintenancePromise) {
    maintenancePromise = runActiveUploadLocationMaintenance(uploadId).finally(() => {
      maintenancePromise = null;
    });
  }

  await maintenancePromise;
}

export function triggerDailyLocationMaintenanceIfDue() {
  void ensureDailyLocationMaintenance();
}

export function triggerActiveUploadLocationMaintenance(options?: { uploadId?: string | null; force?: boolean }) {
  void ensureActiveUploadLocationMaintenance(options);
}
