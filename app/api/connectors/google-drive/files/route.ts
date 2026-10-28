import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessToken, ConnectionError, connectorContext, findConnection, PROVIDER } from "@/lib/connectors/google-drive/connection";
import { DriveError, listImportableFiles, readSettings } from "@/lib/connectors/google-drive/drive";
import { batchState, countByStatus, fileRows, type BatchRow, type BatchState, type RegistryRow } from "@/lib/connectors/google-drive/file-status";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every readable document of the chosen folder with what happened to it (brought, saved, pending, repeated…). */
export async function GET(request: Request) {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const folder = readSettings((await findConnection(ctx.workspaceId))?.settings_json).folder;
  if (!folder) return NextResponse.json({ error: "Elige primero una carpeta de Drive" }, { status: 409 });
  try {
    const token = await accessToken(ctx.workspaceId, new URL(request.url).origin);
    const [{ files, capped }, synced] = await Promise.all([
      listImportableFiles(token, folder.id),
      prisma.connector_synced_files.findMany({ where: { workspace_id: ctx.workspaceId, provider: PROVIDER },
        select: { external_id: true, outcome: true, detail: true, external_md5: true, import_id: true, import_file_id: true, synced_at: true } }),
    ]);
    const registry = new Map<string, RegistryRow>(synced.map((s: { external_id: string; outcome: string; detail: string | null; external_md5: string | null; import_id: string | null; import_file_id: string | null; synced_at: Date }) =>
      [s.external_id, { outcome: s.outcome, detail: s.detail, md5: s.external_md5, importId: s.import_id, importFileId: s.import_file_id, syncedAt: s.synced_at.toISOString() }]));
    const ids = [...new Set([...registry.values()].map(r => r.importId).filter((x): x is string => !!x))];
    // Only the stage statuses (never the whole payload, which can be large).
    const rows = ids.length ? await prisma.$queryRaw<BatchRow[]>(Prisma.sql`
      SELECT k.id::text AS id, k.status, k.error_message AS error,
        k.proposal_json->'lecturaBase'->>'status' AS "lecturaBase", k.proposal_json->'clasificacion'->>'status' AS clasificacion,
        k.proposal_json->'verificacion'->>'status' AS verificacion, k.proposal_json->'conciliacion'->>'status' AS conciliacion,
        k.proposal_json->'escritura'->>'status' AS escritura, k.proposal_json->'escritura'->>'error' AS "escrituraError"
      FROM public.knowledge_imports k
      JOIN public.knowledge_libraries l ON l.id = k.library_id AND l.workspace_id = ${ctx.workspaceId}::uuid
      WHERE k.id = ANY(${ids}::uuid[])`) : [];
    const batches = new Map<string, BatchState>(rows.map(b => [b.id, batchState(b)]));
    // Files that kept data: a part read with a reviewed field set, or records of a template.
    const withData = new Set<string>(ids.length ? (await prisma.$queryRaw<{ file_id: string }[]>(Prisma.sql`
      SELECT DISTINCT f->>'archivoId' AS file_id FROM public.knowledge_imports k
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(k.proposal_json->'resultado'->'archivos', '[]'::jsonb)) f
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(f->'partes', '[]'::jsonb)) p
      WHERE k.id = ANY(${ids}::uuid[]) AND p->>'modo' = 'dirigida'
      UNION SELECT import_file_id::text FROM public.intake_template_documents WHERE workspace_id = ${ctx.workspaceId}::uuid AND status = 'completed' AND records > 0`)).map(r => r.file_id) : []);
    const archivos = fileRows(files, registry, batches, withData);
    return NextResponse.json({ carpeta: folder.name, archivos, recuento: countByStatus(archivos), listaIncompleta: capped, canManage: ctx.canManage });
  } catch (error) {
    if (error instanceof ConnectionError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof DriveError) return NextResponse.json({ error: error.message }, { status: 502 });
    throw error;
  }
}
