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
      availablePropertyManagerIds: latestOperationRun.availablePMs.map(
        (item) => item.propertyManagerId,
      ),
      preventMixedCondominiumOffices: latestOperationRun.preventMixedCondominiumOffices,
      forceEqualCheckins: latestOperationRun.forceEqualCheckins,
      useHereRouting: payload.useHereRouting === true,
      temporaryOfficeByManagerId: Object.fromEntries(
        latestOperationRun.availablePMs
          .filter((item) => item.temporaryOfficeId)
          .map((item) => [item.propertyManagerId, item.temporaryOfficeId!]),
      ),
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
