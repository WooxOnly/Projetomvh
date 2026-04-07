import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth/session";

export async function POST() {
  const sessionCookie = clearSessionCookie();
  const response = NextResponse.json({
    ok: true,
    redirectTo: "/",
  });

  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  return response;
}
