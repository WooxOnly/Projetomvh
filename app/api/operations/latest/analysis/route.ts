import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  getRouteAnalysis,
  parseStoredRouteAnalysis,
} from "@/lib/operations/route-intelligence";
import { getLatestOperationRun } from "@/lib/operations/queries";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });
  }

  try {
    const latestOperationRun = await getLatestOperationRun();

    if (!latestOperationRun) {
      return NextResponse.json(
        { message: "Ainda nao existe uma operacao pronta para analisar." },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const cachedAnalysis = forceRefresh ? null : parseStoredRouteAnalysis(latestOperationRun);

    if (
      cachedAnalysis &&
      cachedAnalysis.managers.length > 0 &&
      cachedAnalysis.managers.every((manager) => manager.mapPoints.length > 0)
    ) {
      return NextResponse.json({ ok: true, analysis: cachedAnalysis, cached: true });
    }

    const propertyManagers = await prisma.propertyManager.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        phone: true,
        officeId: true,
        office: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            lat: true,
            lng: true,
          },
        },
      },
    });

    const analysis = await getRouteAnalysis(latestOperationRun, propertyManagers);

    await prisma.operationRun.update({
      where: {
        id: latestOperationRun.id,
      },
      data: {
        routeAnalysisJson: JSON.stringify(analysis),
        routeAnalysisSource: analysis.source,
        routeAnalysisModel: analysis.model,
        routeAnalysisGeneratedAt: new Date(analysis.generatedAt),
      },
    });

    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel analisar a rota." },
      { status: 400 },
    );
  }
}
