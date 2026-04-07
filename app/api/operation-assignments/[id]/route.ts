import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { updateOperationAssignment } from "@/lib/operations/run-operation";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/operation-assignments/[id]">,
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  try {
    const payload = (await request.json()) as { propertyManagerId?: string };
    if (!payload.propertyManagerId) {
      throw new Error("Selecione um PM para reatribuir.");
    }

    const { id } = await context.params;
    await updateOperationAssignment(id, { propertyManagerId: payload.propertyManagerId });
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel atualizar a atribuicao." },
      { status: 400 },
    );
  }
}
