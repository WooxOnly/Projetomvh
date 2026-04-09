import { after, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { enrichUploadLocationData } from "@/lib/operations/route-geocoding";
import { processUpload, UploadReviewRequiredError } from "@/lib/upload/process-upload";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const operationDateValue = formData.get("operationDate");
  const allowSuspiciousRowsValue = formData.get("allowSuspiciousRows");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "Selecione um arquivo CSV ou XLSX." },
      { status: 400 },
    );
  }

  const operationDateText =
    typeof operationDateValue === "string" && operationDateValue
      ? operationDateValue
      : new Date().toISOString().slice(0, 10);
  const operationDate = new Date(operationDateText);
  const allowSuspiciousRows = allowSuspiciousRowsValue === "true";

  if (Number.isNaN(operationDate.getTime())) {
    return NextResponse.json(
      { message: "Informe uma data de operacao valida." },
      { status: 400 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await processUpload({
      bytes,
      fileName: file.name,
      operationDate,
      allowSuspiciousRows,
    });
    const uploadId = result.upload?.id;

    if (uploadId) {
      after(async () => {
        try {
          await enrichUploadLocationData(uploadId, {
            condominiumLimit: 24,
            propertyLimit: 80,
            checkinLimit: 240,
          });
        } catch (error) {
          console.error("Upload location enrichment failed", error);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Upload processado com sucesso.",
      ...result,
    });
  } catch (error) {
    if (error instanceof UploadReviewRequiredError) {
      return NextResponse.json(
        {
          requiresReview: true,
          message:
            "Encontramos linhas incompletas ou incomuns na planilha. Revise antes de decidir se deseja importar mesmo assim.",
          suspiciousRows: error.suspiciousRows.slice(0, 5),
          suspiciousRowCount: error.suspiciousRows.length,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Nao foi possivel processar o arquivo.",
      },
      { status: 400 },
    );
  }
}
