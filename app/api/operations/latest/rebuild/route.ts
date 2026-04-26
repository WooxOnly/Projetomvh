import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { ensureActiveUploadLocationMaintenance } from "@/lib/operations/location-maintenance";
import { prisma } from "@/lib/prisma";
import { HERE_ROUTING_NOTE, getHereRoutingLockedUntil } from "@/lib/operations/here-usage";
import { getLatestOperationRun } from "@/lib/operations/queries";
import { ensureOperationRouteCoordinates } from "@/lib/operations/route-geocoding";
import { refreshOperationRunRouting, runDailyOperation } from "@/lib/operations/run-operation";
import { isOwnerStayIntegrator } from "@/lib/upload/integrator-rules";

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

    const ownerRouteGroups = (() => {
      const groupedAssignments = new Map<
        string,
        {
          id: string;
          ownerCheckinIds: Set<string>;
          propertyManagerIds: Set<string>;
          reservedCheckinIds: Set<string>;
        }
      >();

      for (const assignment of latestOperationRun.assignments) {
        if (
          assignment.source !== "owner_manual" &&
          assignment.source !== "owner_group_manual"
        ) {
          continue;
        }

        const prefixedClusterLabel = assignment.clusterLabel?.startsWith("owner-group:")
          ? assignment.clusterLabel.slice("owner-group:".length)
          : null;
        const groupId = prefixedClusterLabel || `owner-legacy-${assignment.checkin.id}`;
        const currentGroup = groupedAssignments.get(groupId) ?? {
          id: groupId,
          ownerCheckinIds: new Set<string>(),
          propertyManagerIds: new Set<string>(),
          reservedCheckinIds: new Set<string>(),
        };

        currentGroup.propertyManagerIds.add(assignment.propertyManager.id);

        if (isOwnerStayIntegrator(assignment.checkin.integratorName)) {
          currentGroup.ownerCheckinIds.add(assignment.checkin.id);
        } else {
          currentGroup.reservedCheckinIds.add(assignment.checkin.id);
        }

        groupedAssignments.set(groupId, currentGroup);
      }

      return Array.from(groupedAssignments.values()).map((group) => ({
        id: group.id,
        ownerCheckinIds: Array.from(group.ownerCheckinIds),
        propertyManagerIds: Array.from(group.propertyManagerIds),
        reservedCheckinIds: Array.from(group.reservedCheckinIds),
      }));
    })();

    const operationRun = await runDailyOperation({
      spreadsheetUploadId: latestOperationRun.spreadsheetUpload.id,
      decisionMode: latestOperationRun.decisionMode === "override" ? "override" : "default",
      availablePropertyManagerIds,
      ownerAssignmentsByCheckinId: (() => {
        const groupedAssignments: Record<string, string[]> = {};

        for (const assignment of latestOperationRun.assignments) {
          if (assignment.source !== "owner_manual") {
            continue;
          }

          const current = groupedAssignments[assignment.checkin.id] ?? [];
          current.push(assignment.propertyManager.id);
          groupedAssignments[assignment.checkin.id] = current;
        }

        return groupedAssignments;
      })(),
      ownerRouteGroups,
      useSpreadsheetPmAssignments: latestOperationRun.useSpreadsheetPmAssignments,
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
        await ensureOperationRouteCoordinates(operationRun.id);
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
