import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { createProperty, listProperties } from "@/lib/operations/catalog";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  return NextResponse.json({ items: await listProperties() });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    await createProperty(payload);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel criar o imovel." },
      { status: 400 },
    );
  }
}
