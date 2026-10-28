import { NextResponse } from "next/server";
import { refreshIntakeAlerts } from "@/lib/knowledge/intake/alerts/service";
import { templateContext } from "@/lib/knowledge/intake/templates/access";
import { ignoreDocument, processDocument } from "@/lib/knowledge/intake/templates/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ templateId: string }> };

/** One stored document: { importId, importFileId, accion: "procesar" | "ignorar" }. The browser goes one by one. */
export async function POST(request: Request, context: Context) {
  const ctx = await templateContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!ctx.canManage) return NextResponse.json({ error: "Solo el propietario o un administrador puede procesar documentos" }, { status: 403 });
  const { templateId } = await context.params;
  const body = await request.json().catch(() => null) as { importId?: unknown; importFileId?: unknown; accion?: unknown } | null;
  if (typeof body?.importFileId !== "string" || typeof body.importId !== "string") return NextResponse.json({ error: "Falta el documento" }, { status: 400 });
  try {
    refreshIntakeAlerts(ctx.workspaceId);
    if (body.accion === "ignorar") { await ignoreDocument(ctx.workspaceId, ctx.userId, templateId, body.importFileId); return NextResponse.json({ estado: "ignorado" }); }
    return NextResponse.json(await processDocument({ workspaceId: ctx.workspaceId, userId: ctx.userId, templateId, importId: body.importId, importFileId: body.importFileId }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo procesar" }, { status: 400 }); }
}
