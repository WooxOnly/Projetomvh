import "server-only";

import { CheckinClassification } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  isBlackedOutIntegrator,
  isBlockedStatus,
  isCancelledStatus,
} from "@/lib/upload/integrator-rules";

export function classifyCheckinFromSpreadsheet(
  integratorName: string | null | undefined,
  externalStatus?: string | null | undefined,
) {
  if (isBlackedOutIntegrator(integratorName)) {
    return CheckinClassification.BLOCKED;
  }

  if (isBlockedStatus(externalStatus)) {
    return CheckinClassification.BLOCKED;
  }

  if (isCancelledStatus(externalStatus)) {
    return CheckinClassification.CANCELLED;
  }

  return CheckinClassification.CHECKIN;
}

export async function syncSpreadsheetUploadClassificationTotals(uploadId: string) {
  const operationalCheckins = await prisma.checkin.findMany({
    where: {
      spreadsheetUploadId: uploadId,
      classification: CheckinClassification.CHECKIN,
    },
    select: {
      condominiumId: true,
      condominiumName: true,
      propertyId: true,
      propertyName: true,
      propertyManagerId: true,
      propertyManagerName: true,
      responsibleReference: true,
    },
  });

  const groupedCounts = await prisma.checkin.groupBy({
    by: ["classification"],
    where: {
      spreadsheetUploadId: uploadId,
    },
    _count: {
      _all: true,
    },
  });

  const totalByClassification = new Map(
    groupedCounts.map((item) => [item.classification, item._count._all] as const),
  );
  const totalUniqueCondominiums = new Set(
    operationalCheckins.map((checkin) => checkin.condominiumId ?? checkin.condominiumName ?? ""),
  );
  totalUniqueCondominiums.delete("");

  const totalUniqueProperties = new Set(
    operationalCheckins.map((checkin) => checkin.propertyId ?? checkin.propertyName ?? ""),
  );
  totalUniqueProperties.delete("");

  const totalUniquePMs = new Set(
    operationalCheckins.map(
      (checkin) =>
        checkin.propertyManagerId ??
        checkin.propertyManagerName?.trim() ??
        checkin.responsibleReference?.trim() ??
        "",
    ),
  );
  totalUniquePMs.delete("");

  return prisma.spreadsheetUpload.update({
    where: {
      id: uploadId,
    },
    data: {
      totalCheckins: totalByClassification.get(CheckinClassification.CHECKIN) ?? 0,
      totalOwnerCheckins: totalByClassification.get(CheckinClassification.OWNER) ?? 0,
      totalBlockedCheckins: totalByClassification.get(CheckinClassification.BLOCKED) ?? 0,
      totalCancelledCheckins: totalByClassification.get(CheckinClassification.CANCELLED) ?? 0,
      totalUniqueCondominiums: totalUniqueCondominiums.size,
      totalUniqueProperties: totalUniqueProperties.size,
      totalUniquePMs: totalUniquePMs.size,
    },
    select: {
      id: true,
      totalRows: true,
      totalCheckins: true,
      totalOwnerCheckins: true,
      totalBlockedCheckins: true,
      totalCancelledCheckins: true,
      totalUniqueCondominiums: true,
      totalUniqueProperties: true,
      totalUniquePMs: true,
      fileName: true,
      operationDate: true,
      createdAt: true,
    },
  });
}
