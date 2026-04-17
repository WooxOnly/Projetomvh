import "server-only";

import { CheckinClassification } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function classifyCheckinFromSpreadsheet(
  integratorName: string | null | undefined,
  externalStatus?: string | null | undefined,
) {
  const normalizedValue = integratorName?.trim().toLowerCase() ?? "";
  const normalizedStatus = externalStatus?.trim().toLowerCase() ?? "";

  if (
    normalizedValue === "own (owner staying)" ||
    normalizedValue === "owner"
  ) {
    return CheckinClassification.OWNER;
  }

  if (
    normalizedValue === "blacked out (dates blacked out)" ||
    normalizedValue === "blocked" ||
    normalizedStatus === "cancelled"
  ) {
    return CheckinClassification.BLOCKED;
  }

  return CheckinClassification.CHECKIN;
}

export async function syncSpreadsheetUploadClassificationTotals(uploadId: string) {
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

  return prisma.spreadsheetUpload.update({
    where: {
      id: uploadId,
    },
    data: {
      totalCheckins: totalByClassification.get(CheckinClassification.CHECKIN) ?? 0,
      totalOwnerCheckins: totalByClassification.get(CheckinClassification.OWNER) ?? 0,
      totalBlockedCheckins: totalByClassification.get(CheckinClassification.BLOCKED) ?? 0,
    },
    select: {
      id: true,
      totalRows: true,
      totalCheckins: true,
      totalOwnerCheckins: true,
      totalBlockedCheckins: true,
      totalUniqueCondominiums: true,
      totalUniqueProperties: true,
      totalUniquePMs: true,
      fileName: true,
      operationDate: true,
      createdAt: true,
    },
  });
}
