import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getLatestOperationRun } from "@/lib/operations/queries";
import { runDailyOperation } from "@/lib/operations/run-operation";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      useHereRouting?: boolean;
    };
    const latestOperationRun = await getLatestOperationRun();

    if (!latestOperationRun) {
      return NextResponse.json(
        { message: "Ainda não existe uma operação pronta para recalcular." },
        { status: 404 },
      );
    }

    await runDailyOperation({
      spreadsheetUploadId: latestOperationRun.spreadsheetUpload.id,
      decisionMode: latestOperationRun.decisionMode === "override" ? "override" : "default",
      availablePropertyManagerIds: latestOperationRun.availablePMs.map(({ propertyManagerId }) => {
        return propertyManagerId;
      }),
      preventMixedCondominiumOffices: latestOperationRun.preventMixedCondominiumOffices,
      forceEqualCheckins: latestOperationRun.forceEqualCheckins,
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

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true });
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
