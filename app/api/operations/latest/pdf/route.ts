import { getSession } from "@/lib/auth/session";
import { getLatestOperationReportData } from "@/lib/operations/queries";
import { buildOperationPdf } from "@/lib/operations/route-exports";
import { DEFAULT_FRONTEND_LANGUAGE, isFrontendLanguage } from "@/lib/frontend-language";

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return new Response(JSON.stringify({ message: "Sessao expirada." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const propertyManagerId = url.searchParams.get("propertyManagerId") ?? undefined;
    const languageParam = url.searchParams.get("language");
    const language = isFrontendLanguage(languageParam)
      ? languageParam
      : DEFAULT_FRONTEND_LANGUAGE;
    const { latestOperationRun, propertyManagers } = await getLatestOperationReportData();

    if (!latestOperationRun) {
      return new Response(JSON.stringify({ message: "Ainda nao existe uma operacao pronta para exportar." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pdfBytes = await buildOperationPdf(
      latestOperationRun,
      propertyManagers,
      propertyManagerId,
      language,
    );
    const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(pdfBuffer).set(pdfBytes);
    const fileDate = new Intl.DateTimeFormat("en-CA", {
      dateStyle: "short",
      timeZone: "UTC",
    })
      .format(new Date(latestOperationRun.operationDate))
      .replace(/\//g, "-");
    const managerName = propertyManagerId
      ? latestOperationRun.assignments.find(
          (assignment) => assignment.propertyManager.id === propertyManagerId,
        )?.propertyManager.name
      : null;
    const fileName = managerName
      ? `rota-${fileDate}-${sanitizeFileNamePart(managerName)}.pdf`
      : `rota-${fileDate}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : "Nao foi possivel gerar o PDF.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
