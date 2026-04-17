import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { ensureActiveUploadLocationMaintenance } from "@/lib/operations/location-maintenance";
import { ensureOperationRouteCoordinates } from "@/lib/operations/route-geocoding";
import { refreshOperationRunRouting, runDailyOperation } from "@/lib/operations/run-operation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  try {
    const payload = (await request.json()) as {
      spreadsheetUploadId?: string;
      decisionMode?: "default" | "override";
      availablePropertyManagerIds?: string[];
      ownerAssignmentsByCheckinId?: Record<string, string[]>;
      useSpreadsheetPmAssignments?: boolean;
      preventMixedCondominiumOffices?: boolean;
      forceEqualCheckins?: boolean;
      endRouteNearOffice?: boolean;
      useHereRouting?: boolean;
      temporaryOfficeByManagerId?: Record<string, string>;
    };

    if (!payload.spreadsheetUploadId) {
      throw new Error("Selecione um upload para rodar a operacao.");
    }

    const operationRun = await runDailyOperation({
      spreadsheetUploadId: payload.spreadsheetUploadId,
      decisionMode: payload.decisionMode === "override" ? "override" : "default",
      availablePropertyManagerIds: payload.availablePropertyManagerIds ?? [],
      ownerAssignmentsByCheckinId: payload.ownerAssignmentsByCheckinId ?? {},
      useSpreadsheetPmAssignments: payload.useSpreadsheetPmAssignments === true,
      preventMixedCondominiumOffices: payload.preventMixedCondominiumOffices !== false,
      forceEqualCheckins: payload.forceEqualCheckins !== false,
      endRouteNearOffice: payload.endRouteNearOffice !== false,
      useHereRouting: payload.useHereRouting === true,
      temporaryOfficeByManagerId: payload.temporaryOfficeByManagerId ?? {},
    });

    after(async () => {
      try {
        await ensureOperationRouteCoordinates(operationRun.id);
        await ensureActiveUploadLocationMaintenance({
          uploadId: payload.spreadsheetUploadId,
          force: true,
        });
        await refreshOperationRunRouting(operationRun.id);
      } catch (error) {
        console.error("Post-operation route enrichment failed", error);
      }
    });

    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel executar a operacao." },
      { status: 400 },
    );
  }
}
