import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getLatestOperationReportData } from "@/lib/operations/queries";
import { getWhatsAppExport } from "@/lib/operations/route-exports";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const propertyManagerId = url.searchParams.get("propertyManagerId") ?? undefined;
    const { latestOperationRun, propertyManagers } = await getLatestOperationReportData();

    if (!latestOperationRun) {
      return NextResponse.json(
        { message: "Ainda nao existe uma operacao pronta para exportar." },
        { status: 404 },
      );
    }

    const payload = getWhatsAppExport(
      latestOperationRun,
      propertyManagers,
      propertyManagerId,
    );
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel montar a mensagem." },
      { status: 400 },
    );
  }
}
