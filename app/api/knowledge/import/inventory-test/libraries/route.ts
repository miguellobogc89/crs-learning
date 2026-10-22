import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const libraries = await prisma.knowledge_libraries.findMany({
    where: { workspace_id: activeWorkspace.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ libraries });
}
