import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { updateCondominiumClassification } from "@/lib/operations/catalog";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/condominiums/[id]/classification">,
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as { officeId?: string; region?: string };
    const { id } = await context.params;

    await updateCondominiumClassification(id, payload);
    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel atualizar office/regiao do condominio.",
      },
      { status: 400 },
    );
  }
}
