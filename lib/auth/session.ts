import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE = 60 * 60 * 24;

type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }

  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);

  return `${body}.${signature}`;
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

function decode(token?: string | null): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = sign(body);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;

    if (parsed.exp <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function createSession(input: Omit<SessionPayload, "exp">) {
  const store = await cookies();
  const { name, value, options } = createSessionCookie(input);
  store.set(name, value, options);
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export function createSessionCookie(input: Omit<SessionPayload, "exp">) {
  const value = encode({
    ...input,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });

  return {
    name: SESSION_COOKIE_NAME,
    value,
    options: getSessionCookieOptions(),
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    options: {
      ...getSessionCookieOptions(),
      maxAge: 0,
    },
  };
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  return decode(token);
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return session;
}
