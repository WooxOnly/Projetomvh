import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  ensureDailyLocationMaintenance,
  getLocationCoverageStatus,
} from "@/lib/operations/location-maintenance";

export const dynamic = "force-dynamic";

function hasCronAccess(request: Request) {
  const configuredSecret = process.env.LOCATION_MAINTENANCE_CRON_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization === `Bearer ${configuredSecret}`) {
    return true;
  }

  return request.headers.get("x-cron-secret")?.trim() === configuredSecret;
}

async function canAccessRoute(request: Request) {
  if (hasCronAccess(request)) {
    return true;
  }

  const session = await getSession();
  return Boolean(session);
}

export async function GET(request: Request) {
  if (!(await canAccessRoute(request))) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  await ensureDailyLocationMaintenance({ force });

  const status = await getLocationCoverageStatus();
  return NextResponse.json({ ok: true, forced: force, status });
}

export async function POST(request: Request) {
  return GET(request);
}
