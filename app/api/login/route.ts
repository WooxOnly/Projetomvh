import { NextResponse } from "next/server";

import { createSessionCookie } from "@/lib/auth/session";
import { authenticateUser } from "@/lib/auth/user";
import { validateLoginInput } from "@/lib/auth/validation";

function redirectResponse(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
    },
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  let expectsJson = false;

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  expectsJson =
    contentType.includes("application/json") ||
    (request.headers.get("accept")?.toLowerCase() ?? "").includes("application/json");

  if (contentType.includes("application/json")) {
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Requisicao invalida." },
        { status: 400 },
      );
    }
  } else {
    const formData = await request.formData();
    payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };
  }

  const validation = validateLoginInput(
    typeof payload === "object" && payload !== null ? payload : {},
  );

  if (!validation.success) {
    if (!expectsJson) {
      return redirectResponse("/");
    }

    return NextResponse.json(
      {
        message: "Confira os campos informados.",
        errors: validation.errors,
      },
      { status: 400 },
    );
  }

  const user = await authenticateUser(validation.data.email, validation.data.password);

  if (!user) {
    if (!expectsJson) {
      return redirectResponse("/");
    }

    return NextResponse.json(
      { message: "E-mail ou senha invalidos." },
      { status: 401 },
    );
  }

  const sessionCookie = createSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  const response = expectsJson
    ? NextResponse.json({
        ok: true,
        redirectTo: "/dashboard",
      })
    : redirectResponse("/dashboard");

  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  if (!expectsJson) {
    return response;
  }

  return response;
}
