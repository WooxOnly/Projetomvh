import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { ensureActiveUploadLocationMaintenance } from "@/lib/operations/location-maintenance";
import { prisma } from "@/lib/prisma";
import { HERE_ROUTING_NOTE, getHereRoutingLockedUntil } from "@/lib/operations/here-usage";
import { getLatestOperationRun } from "@/lib/operations/queries";
import { refreshOperationRunRouting, runDailyOperation } from "@/lib/operations/run-operation";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      useHereRouting?: boolean;
    };

    if (payload.useHereRouting === true) {
      const latestHereRoutingRun = await prisma.operationRun.findFirst({
        where: {
          notes: HERE_ROUTING_NOTE,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
        },
      });

      const lockedUntil = getHereRoutingLockedUntil(latestHereRoutingRun?.createdAt ?? null);

      if (lockedUntil) {
        return NextResponse.json(
          {
            message: `A API HERE já foi usada recentemente. Tente novamente após ${lockedUntil.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/New_York",
            })}.`,
            hereRoutingLockedUntil: lockedUntil.toISOString(),
          },
          { status: 429 },
        );
      }
    }

    const latestOperationRun = await getLatestOperationRun();

    if (!latestOperationRun) {
      return NextResponse.json(
        { message: "Ainda não existe uma operação pronta para recalcular." },
        { status: 404 },
      );
    }

    const availablePropertyManagerIds: string[] = [];
    for (const availablePm of latestOperationRun.availablePMs) {
      availablePropertyManagerIds.push(availablePm.propertyManagerId);
    }

    const operationRun = await runDailyOperation({
      spreadsheetUploadId: latestOperationRun.spreadsheetUpload.id,
      decisionMode: latestOperationRun.decisionMode === "override" ? "override" : "default",
      availablePropertyManagerIds,
      preventMixedCondominiumOffices: latestOperationRun.preventMixedCondominiumOffices,
      forceEqualCheckins: latestOperationRun.forceEqualCheckins,
      endRouteNearOffice: latestOperationRun.endRouteNearOffice,
      useHereRouting: payload.useHereRouting === true,
      temporaryOfficeByManagerId: (() => {
        const entries: Record<string, string> = {};
        for (const availablePm of latestOperationRun.availablePMs) {
          if (availablePm.temporaryOfficeId) {
            entries[availablePm.propertyManagerId] = availablePm.temporaryOfficeId;
          }
        }
        return entries;
      })(),
    });

    after(async () => {
      try {
        await ensureActiveUploadLocationMaintenance({
          uploadId: latestOperationRun.spreadsheetUpload.id,
          force: true,
        });
        await refreshOperationRunRouting(operationRun.id);
      } catch (error) {
        console.error("Post-rebuild route enrichment failed", error);
      }
    });

    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      hereRoutingLockedUntil:
        payload.useHereRouting === true
          ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível recalcular a operação.",
      },
      { status: 400 },
    );
  }
}
