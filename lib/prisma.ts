// lib/prisma.ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

function hasWorkspaceDelegates(client: PrismaClient | undefined) {
  const candidate = client as
    | (PrismaClient & {
        workspace_invites?: unknown;
        workspace_members?: unknown;
        workspaces?: unknown;
      })
    | undefined;

  return Boolean(
    candidate?.workspace_invites &&
      candidate.workspace_members &&
      candidate.workspaces,
  );
}

export const prisma =
  hasWorkspaceDelegates(globalForPrisma.prisma)
    ? globalForPrisma.prisma!
    : new PrismaClient({
        adapter,
        log: ["error", "warn"],
      });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
