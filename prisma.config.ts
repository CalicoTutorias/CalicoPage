import "dotenv/config";
import { defineConfig } from "prisma/config";

function isLocalDatabase(url?: string) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function guardRemoteDestructiveCommands() {
  const args = process.argv.slice(2);
  const isMigrateReset = args.includes("migrate") && args.includes("reset");
  const isForceReset = args.includes("--force-reset");

  if ((isMigrateReset || isForceReset) && !isLocalDatabase(process.env.DATABASE_URL)) {
    throw new Error(
      [
        "Blocked: refusing to run a destructive Prisma reset against a remote database.",
        "Use a local DATABASE_URL for reset operations.",
        "If this database needs recovery, restore it from an RDS snapshot instead.",
      ].join(" "),
    );
  }
}

guardRemoteDestructiveCommands();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
