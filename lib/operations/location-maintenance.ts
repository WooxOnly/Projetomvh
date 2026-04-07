import "server-only";

import {
  getLastLocationMaintenanceAt,
  setLastLocationMaintenanceAt,
} from "@/lib/upload/active-upload";
import {
  auditCheckinLocationData,
  auditPropertyLocationData,
  enrichMissingCheckinLocationData,
  enrichMissingCondominiumLocationData,
  enrichMissingPropertyLocationData,
} from "@/lib/operations/route-geocoding";
import { prisma } from "@/lib/prisma";

const DAILY_MAINTENANCE_INTERVAL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_PROPERTY_BATCH_SIZE = 250;
const DEFAULT_CHECKIN_BATCH_SIZE = 1000;
const MAX_MAINTENANCE_PASSES_PER_RUN = 6;

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

  for (let pass = 0; pass < MAX_MAINTENANCE_PASSES_PER_RUN; pass += 1) {
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

export function triggerDailyLocationMaintenanceIfDue() {
  void ensureDailyLocationMaintenance();
}
