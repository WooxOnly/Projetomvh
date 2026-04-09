import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getLatestOperationRun } from "@/lib/operations/queries";
import {
  rebalanceOperationManagerRoutes,
  swapOperationManagerRoutes,
} from "@/lib/operations/run-operation";

type RouteAdjustmentPayload =
  | {
      action: "swap_full";
      firstPropertyManagerId?: string;
      secondPropertyManagerId?: string;
    }
  | {
      action: "adjust_between";
      firstPropertyManagerId?: string;
      secondPropertyManagerId?: string;
      assignmentIdsToFirstManager?: string[];
      assignmentIdsToSecondManager?: string[];
    };

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as RouteAdjustmentPayload;
    const latestOperationRun = await getLatestOperationRun();

    if (!latestOperationRun) {
      return NextResponse.json(
        { message: "Ainda nao existe uma operacao pronta para ajustar." },
        { status: 404 },
      );
    }

    if (!payload.firstPropertyManagerId || !payload.secondPropertyManagerId) {
      throw new Error("Selecione dois PMs para ajustar as rotas.");
    }

    if (payload.action === "swap_full") {
      await swapOperationManagerRoutes({
        operationRunId: latestOperationRun.id,
        firstPropertyManagerId: payload.firstPropertyManagerId,
        secondPropertyManagerId: payload.secondPropertyManagerId,
      });
    } else if (payload.action === "adjust_between") {
      await rebalanceOperationManagerRoutes({
        operationRunId: latestOperationRun.id,
        firstPropertyManagerId: payload.firstPropertyManagerId,
        secondPropertyManagerId: payload.secondPropertyManagerId,
        assignmentIdsToFirstManager: payload.assignmentIdsToFirstManager ?? [],
        assignmentIdsToSecondManager: payload.assignmentIdsToSecondManager ?? [],
      });
    } else {
      throw new Error("A acao solicitada nao e suportada.");
    }

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel aplicar o ajuste entre as rotas.",
      },
      { status: 400 },
    );
  }
}
