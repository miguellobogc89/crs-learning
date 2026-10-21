import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { SCHEMA_DISCOVERY_INSTRUCTIONS } from "@/lib/engine/schema-discovery/discover.service";
import { validateSchemaDiscovery } from "@/lib/engine/schema-discovery/validation";
import { STRESS_DOCUMENT, evaluateStressSchema } from "@/lib/engine/schema-discovery/stress-test";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (!["owner", "admin"].includes(activeWorkspace.role))
    return NextResponse.json({ error: "Se requieren permisos de administrador." }, { status: 403 });
  try {
    const documentId = "stress-commercial-fixture";
    const started = Date.now();
    const response = await getOpenAIClient().responses.create({
      model: getKnowledgeImportModel(),
      instructions: SCHEMA_DISCOVERY_INSTRUCTIONS,
      input: JSON.stringify({
        task: "Discover a normalized relational schema from the supplied business document. Return evidence-backed entities, fields and relations as JSON. Do not persist.",
        documents: [{ id: documentId, text: STRESS_DOCUMENT }],
      }),
      text: { format: { type: "json_object" } },
    });
    if (!response.output_text || response.output_text.length > 250000)
      throw new Error("Invalid model response.");
    const validation = validateSchemaDiscovery({
      workspaceId: activeWorkspace.id,
      documents: [{ id: documentId, workspaceId: activeWorkspace.id, extractedText: STRESS_DOCUMENT }],
      proposal: JSON.parse(response.output_text),
    });
    const score = validation.proposal ? evaluateStressSchema(validation.proposal) : null;
    return NextResponse.json({
      status: validation.valid ? "evaluated" : "invalid_schema",
      score,
      issues: validation.issues,
      entities: validation.proposal?.entities.map(e => ({ key: e.key, name: e.name, fields: e.fields.map(f => f.key) })) ?? [],
      relations: validation.proposal?.relations.map(r => ({ key: r.key, from: r.fromEntity, to: r.toEntity })) ?? [],
      warnings: validation.proposal?.warnings ?? [],
      durationMs: Date.now() - started,
      writesPerformed: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[engine-stress-test]", error);
    return NextResponse.json({ error: "No se pudo ejecutar la prueba de IA. Consulta los registros del servidor." }, { status: 500 });
  }
}
