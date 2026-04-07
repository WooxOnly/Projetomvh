import "server-only";

import { prisma } from "@/lib/prisma";

export async function getSpreadsheetUploadSequenceMap() {
  const uploads = await prisma.spreadsheetUpload.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return new Map(uploads.map((upload, index) => [upload.id, index + 1]));
}

export function attachUploadSequenceNumber<T extends { id: string }>(
  upload: T | null,
  sequenceMap: Map<string, number>,
): (T & { sequenceNumber: number | null }) | null {
  if (!upload) {
    return null;
  }

  return {
    ...upload,
    sequenceNumber: sequenceMap.get(upload.id) ?? null,
  };
}

export function attachUploadSequenceNumbers<T extends { id: string }>(
  uploads: T[],
  sequenceMap: Map<string, number>,
): Array<T & { sequenceNumber: number | null }> {
  return uploads.map((upload) => ({
    ...upload,
    sequenceNumber: sequenceMap.get(upload.id) ?? null,
  }));
}
