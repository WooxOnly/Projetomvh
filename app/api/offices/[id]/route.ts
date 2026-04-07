import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { deleteOffice, updateOffice } from "@/lib/offices";

export async function PATCH(request: Request, context: RouteContext<"/api/offices/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const { id } = await context.params;
    await updateOffice(id, payload);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel atualizar o office." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/offices/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  try {
    const { id } = await context.params;
    await deleteOffice(id);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel remover o office." },
      { status: 400 },
    );
  }
}
