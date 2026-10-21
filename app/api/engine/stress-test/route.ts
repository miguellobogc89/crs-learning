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
    const rawProposal: unknown = JSON.parse(response.output_text);
    const raw = rawProposal && typeof rawProposal === "object" && !Array.isArray(rawProposal)
      ? rawProposal as Record<string, unknown> : {};
    const rawEntities = Array.isArray(raw.entities) ? raw.entities.slice(0, 50) : [];
    const rawRelations = Array.isArray(raw.relations) ? raw.relations.slice(0, 200) : [];
    const normalized = { ...raw, relations: rawRelations.map((relation: unknown) => {
      if (!relation || typeof relation !== "object" || Array.isArray(relation)) return relation;
      const item = relation as Record<string, unknown>;
      const cardinality = typeof item.cardinality === "string" ? item.cardinality.trim().toLowerCase().replace(/[\\s-]+/g, "_") : item.cardinality;
      const aliases: Record<string, string> = {
        "1:1": "one_to_one", "1:many": "one_to_many", "1:n": "one_to_many",
        "one_to_n": "one_to_many", "one_to_multiple": "one_to_many",
        "n:m": "many_to_many", "m:n": "many_to_many", "many_to_n": "many_to_many",
        "one_to_many": "one_to_many", "one_to_one": "one_to_one", "many_to_many": "many_to_many",
      };
      return { ...item, cardinality: typeof cardinality === "string" ? aliases[cardinality] ?? cardinality : cardinality };
    }) };
    const validation = validateSchemaDiscovery({
      workspaceId: activeWorkspace.id,
      documents: [{ id: documentId, workspaceId: activeWorkspace.id, extractedText: STRESS_DOCUMENT }],
      proposal: normalized,
    });
    const score = validation.proposal ? evaluateStressSchema(validation.proposal) : null;
    const inspectionEntities = (validation.proposal?.entities ?? rawEntities).map((e: any) => ({
      key: typeof e?.key === "string" ? e.key : "",
      name: typeof e?.name === "string" ? e.name : "",
      fields: Array.isArray(e?.fields) ? e.fields.slice(0, 100).map((f: any) => typeof f?.key === "string" ? f.key : "") : [],
    }));
    const inspectionRelations = (validation.proposal?.relations ?? rawRelations).map((r: any) => ({
      key: typeof r?.key === "string" ? r.key : "",
      from: typeof r?.fromEntity === "string" ? r.fromEntity : "",
      to: typeof r?.toEntity === "string" ? r.toEntity : "",
      cardinality: typeof r?.cardinality === "string" ? r.cardinality : null,
    }));
    return NextResponse.json({
      status: validation.valid ? "evaluated" : "invalid_schema",
      score,
      issues: validation.issues,
      entities: inspectionEntities,
      relations: inspectionRelations,
      warnings: validation.proposal?.warnings ?? [],
      durationMs: Date.now() - started,
      writesPerformed: false,
      diagnosticOnly: !validation.valid,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[engine-stress-test]", error);
    return NextResponse.json({ error: "No se pudo ejecutar la prueba de IA. Consulta los registros del servidor." }, { status: 500 });
  }
}
