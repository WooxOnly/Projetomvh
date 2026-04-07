import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const userCount = await prisma.user.count();

    return NextResponse.json({
      ok: true,
      userCount,
    });
  } catch (error) {
    const details =
      error && typeof error === "object"
        ? {
            name: "name" in error ? error.name : "UnknownError",
            message: "message" in error ? error.message : String(error),
            code: "code" in error ? error.code : null,
          }
        : {
            name: "UnknownError",
            message: String(error),
            code: null,
          };

    console.error("DB health route failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: details,
      },
      { status: 500 },
    );
  }
}
