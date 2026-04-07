/* eslint-disable @typescript-eslint/no-require-imports */

process.loadEnvFile?.(".env");

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const DEFAULT_EMAIL = "woox13@gmail.com";
const DEFAULT_PASSWORD = "M.12a.93";
const DEFAULT_NAME = "Administrador";
const DEFAULT_ROLE = "ADMIN";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  const email = (process.env.SEED_USER_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
  const name = process.env.SEED_USER_NAME ?? DEFAULT_NAME;
  const role = process.env.SEED_USER_ROLE ?? DEFAULT_ROLE;

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash: password,
        role,
      },
      create: {
        email,
        name,
        passwordHash: password,
        role,
      },
      select: {
        email: true,
      },
    });

    console.log(`Seed user ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
