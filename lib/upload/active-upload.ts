import "server-only";

import { prisma } from "@/lib/prisma";

const SYSTEM_STATE_ID = "global";

export async function getActiveSpreadsheetUploadId() {
  const state = await prisma.systemState.findUnique({
    where: { id: SYSTEM_STATE_ID },
    select: { activeSpreadsheetUploadId: true },
  });

  return state?.activeSpreadsheetUploadId ?? null;
}

export async function setActiveSpreadsheetUpload(uploadId: string | null) {
  await prisma.systemState.upsert({
    where: { id: SYSTEM_STATE_ID },
    update: {
      activeSpreadsheetUploadId: uploadId,
    },
    create: {
      id: SYSTEM_STATE_ID,
      activeSpreadsheetUploadId: uploadId,
    },
  });
}

export async function getLastLocationMaintenanceAt() {
  const state = await prisma.systemState.findUnique({
    where: { id: SYSTEM_STATE_ID },
    select: { lastLocationMaintenanceAt: true },
  });

  return state?.lastLocationMaintenanceAt ?? null;
}

export async function setLastLocationMaintenanceAt(value: Date) {
  await prisma.systemState.upsert({
    where: { id: SYSTEM_STATE_ID },
    update: {
      lastLocationMaintenanceAt: value,
    },
    create: {
      id: SYSTEM_STATE_ID,
      lastLocationMaintenanceAt: value,
    },
  });
}
