import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { setActiveSpreadsheetUpload } from "@/lib/upload/active-upload";
import { getSpreadsheetUploadSequenceMap } from "@/lib/upload/sequence";

export async function PATCH(request: Request) {
  await requireSession();

  const payload = (await request.json().catch(() => ({}))) as { uploadId?: string };
  const uploadId = payload.uploadId?.trim();

  if (!uploadId) {
    return NextResponse.json({ message: "Selecione um upload válido." }, { status: 400 });
  }

  const upload = await prisma.spreadsheetUpload.findUnique({
    where: { id: uploadId },
    select: { id: true, fileName: true },
  });

  if (!upload) {
    return NextResponse.json({ message: "Upload não encontrado." }, { status: 404 });
  }

  await setActiveSpreadsheetUpload(upload.id);
  const sequenceMap = await getSpreadsheetUploadSequenceMap();
  const prefix = sequenceMap.get(upload.id) != null ? `#${sequenceMap.get(upload.id)} ` : "";

  return NextResponse.json({
    ok: true,
    message: `Upload ativo atualizado para ${prefix}${upload.fileName}.`,
  });
}

export async function DELETE() {
  await requireSession();

  await setActiveSpreadsheetUpload(null);

  return NextResponse.json({
    ok: true,
    message: "Nenhum upload ativo no sistema.",
  });
}
