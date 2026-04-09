import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { runDailyOperation } from "@/lib/operations/run-operation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  try {
    const payload = (await request.json()) as {
      spreadsheetUploadId?: string;
      decisionMode?: "default" | "override";
      availablePropertyManagerIds?: string[];
      preventMixedCondominiumOffices?: boolean;
      forceEqualCheckins?: boolean;
      endRouteNearOffice?: boolean;
      useHereRouting?: boolean;
      temporaryOfficeByManagerId?: Record<string, string>;
    };

    if (!payload.spreadsheetUploadId) {
      throw new Error("Selecione um upload para rodar a operacao.");
    }

    await runDailyOperation({
      spreadsheetUploadId: payload.spreadsheetUploadId,
      decisionMode: payload.decisionMode === "override" ? "override" : "default",
      availablePropertyManagerIds: payload.availablePropertyManagerIds ?? [],
      preventMixedCondominiumOffices: payload.preventMixedCondominiumOffices !== false,
      forceEqualCheckins: payload.forceEqualCheckins !== false,
      endRouteNearOffice: payload.endRouteNearOffice !== false,
      useHereRouting: payload.useHereRouting === true,
      temporaryOfficeByManagerId: payload.temporaryOfficeByManagerId ?? {},
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
