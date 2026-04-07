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
    await Promise.all(
      expiredUploads.map(async (upload) => {
        try {
          await unlink(upload.filePath);
        } catch {}
      }),
    );

    await prisma.spreadsheetUpload.deleteMany({
      where: {
        id: {
          in: expiredUploads.map((upload) => upload.id),
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
