import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EnginePreviewClient } from "./preview-client";

export default async function EnginePreviewPage({ searchParams }: { searchParams: Promise<{ embedded?: string }> }) {
  const embedded = (await searchParams).embedded === "1";
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const files = await prisma.knowledge_files.findMany({
    where: {
      status: { in: ["ready", "processed"] },
      knowledge_sources: knowledgeSourceReadWhere(session.user.id, activeWorkspace.id),
    },
    select: { id: true, file_name: true },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return (
    <main className={embedded ? "mx-auto h-full w-full max-w-7xl space-y-4 overflow-y-auto px-4 py-4" : "mx-auto w-full max-w-5xl space-y-6 overflow-y-auto px-6 py-8"}>
      {!embedded && <Link href="/knowledge" className="text-sm text-blue-600 hover:underline">
        ← Volver a Knowledge
      </Link>}
      {!embedded && <div>
        <h1 className="text-2xl font-semibold text-slate-900">Prueba de análisis Engine</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sube primero tu PDF desde Knowledge con «Nuevo → Subir archivos».
          Cuando termine de procesarse, selecciónalo aquí para revisar lo que CRS descubre.
        </p>
      </div>}
      <EnginePreviewClient files={files.map(f => ({ id: f.id, name: f.file_name }))} />
    </main>
  );
}
