import { prisma } from "@/lib/prisma";

export async function listEngineObjectTypes(organizationId: string) {
  return prisma.engine_object_types.findMany({
    where: { organization_id: organizationId, status: "active" },
    orderBy: { name: "asc" },
  });
}
