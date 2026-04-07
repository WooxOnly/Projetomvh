process.loadEnvFile?.(".env");

const DEFAULT_EMAIL = "admin@otimizarcheckin.com";
const DEFAULT_PASSWORD = "Admin123!";
const DEFAULT_NAME = "Administrador";

async function main() {
  const [prismaModule, { hashPassword }] = await Promise.all([
    import("@prisma/client"),
    import("../lib/auth/password.ts"),
  ]);
  const PrismaClient =
    prismaModule.PrismaClient ?? prismaModule.default?.PrismaClient;

  if (!PrismaClient) {
    throw new Error("PrismaClient is unavailable in the current runtime.");
  }

  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  const email = (process.env.SEED_USER_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
  const name = process.env.SEED_USER_NAME ?? DEFAULT_NAME;

  if (password.length < 8) {
    throw new Error("SEED_USER_PASSWORD must be at least 8 characters long.");
  }

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash: hashPassword(password),
      },
      create: {
        email,
        name,
        passwordHash: hashPassword(password),
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    console.log(`Seed user ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
