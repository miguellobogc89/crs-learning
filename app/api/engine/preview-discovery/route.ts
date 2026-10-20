import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { previewDynamicSchemaEvolutionWithSemanticReview } from "@/lib/engine/schema-discovery/preview-evolution.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  // Session cookies must not authorize cross-origin POSTs.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("knowledgeFileId" in body) ||
      typeof body.knowledgeFileId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.knowledgeFileId))
    return NextResponse.json({ error: "Selecciona un archivo válido." }, { status: 400 });

  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    // The service enforces owner/admin and per-file visibility before any AI call.
    const preview = await previewDynamicSchemaEvolutionWithSemanticReview({
      workspaceId: activeWorkspace.id,
      userId: session.user.id,
      knowledgeFileIds: [body.knowledgeFileId],
    });
    if (preview.status === "INVALID_PROPOSAL")
      return NextResponse.json({ status: preview.status, issues: preview.discovery.issues,
        writesPerformed: false });
    return NextResponse.json({
      status: preview.status,
      discoveredEntities: preview.discovery.proposal?.entities.map(entity => ({
        key: entity.key,
        fields: entity.fields.map(field => ({ key: field.key, type: field.type })),
      })) ?? [],
      discoveredRelations: preview.discovery.proposal?.relations.map(relation => ({
        key: relation.key, fromEntity: relation.fromEntity,
        toEntity: relation.toEntity, cardinality: relation.cardinality,
      })) ?? [],
      suggestions: preview.comparison.suggested.map(s => ({ kind: s.kind, path: s.path })),
      reviewPlan: preview.reviewPlan,
      semanticIssues: preview.semantic.issues,
      writesPerformed: false,
    });
  } catch (error) {
    console.error("Engine preview failed", error);
    const message = error instanceof Error ? error.message : "";
    const isPermission = /owner or admin required|workspace.*required/i.test(message);
    const isFile = /inaccessible|no longer accessible|not ready|Knowledge access changed/i.test(message);
    const isAi = /OpenAI|schema discovery response|semantic comparison|response size|JSON/i.test(message);
    return NextResponse.json({
      code: isPermission ? "ENGINE_PERMISSION" : isFile ? "KNOWLEDGE_FILE" : isAi ? "AI_ANALYSIS" : "ENGINE_PREVIEW",
      error: isPermission
        ? "Necesitas permisos de propietario o administrador del espacio para ejecutar esta prueba."
        : isFile
          ? "El documento no está disponible o no tiene texto procesado accesible en este espacio."
          : isAi
            ? "El análisis de IA no pudo completarse. Consulta el registro del servidor."
            : "El Engine no pudo completar el análisis. Consulta el registro del servidor.",
    }, { status: isPermission ? 403 : 422 });
  }
}
