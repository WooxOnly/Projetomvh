import { CheckinClassification } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { syncSpreadsheetUploadClassificationTotals } from "@/lib/upload/checkin-classification";
import {
  getActiveUploadSummary,
  getSpreadsheetUploadReviewData,
} from "@/lib/upload/queries";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { classification?: string };

  if (!body.classification || !(body.classification in CheckinClassification)) {
    return NextResponse.json(
      { message: "Informe uma classificacao valida." },
      { status: 400 },
    );
  }

  const nextClassification = body.classification as CheckinClassification;

  const checkin = await prisma.checkin.findUnique({
    where: { id },
    select: {
      id: true,
      spreadsheetUploadId: true,
      classification: true,
      assignments: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!checkin) {
    return NextResponse.json(
      { message: "Check-in nao encontrado." },
      { status: 404 },
    );
  }

  if (checkin.classification !== nextClassification && checkin.assignments.length > 0) {
    return NextResponse.json(
      {
        message:
          "Este item ja faz parte de uma operacao distribuida. Ajuste a classificacao antes de rodar a operacao ou refaca a distribuicao.",
      },
      { status: 409 },
    );
  }

  await prisma.checkin.update({
    where: { id },
    data: {
      classification: nextClassification,
      status: nextClassification === CheckinClassification.CHECKIN ? "pending" : "classified_out",
    },
  });

  await syncSpreadsheetUploadClassificationTotals(checkin.spreadsheetUploadId);

  const [upload, uploadReview] = await Promise.all([
    getActiveUploadSummary(),
    getSpreadsheetUploadReviewData(checkin.spreadsheetUploadId),
  ]);

  return NextResponse.json({
    ok: true,
    message: "Classificacao atualizada com sucesso.",
    upload,
    uploadReview,
  });
}
