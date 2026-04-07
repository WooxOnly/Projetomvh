import "server-only";

import { unlink } from "node:fs/promises";

import { prisma } from "@/lib/prisma";

export async function cleanupExpiredOperationalData() {
  const now = new Date();

  const expiredUploads = await prisma.spreadsheetUpload.findMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
    select: {
      id: true,
      filePath: true,
    },
  });

  if (expiredUploads.length > 0) {
    for (const uploadRecord of expiredUploads) {
      try {
        await unlink(uploadRecord.filePath);
      } catch {}
    }

    const expiredUploadIds: string[] = [];
    for (const uploadRecord of expiredUploads) {
      expiredUploadIds.push(uploadRecord.id);
    }

    await prisma.spreadsheetUpload.deleteMany({
      where: {
        id: {
          in: expiredUploadIds,
        },
      },
    });
  }

  await prisma.operationRun.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });
}
