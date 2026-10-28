import { NextResponse } from "next/server";
import { templateContext } from "@/lib/knowledge/intake/templates/access";
import { proposeFor } from "@/lib/knowledge/intake/templates/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** A proposed table for a document type, from a few of the workspace's documents of that type (nothing is saved). */
export async function POST(request: Request) {
  const ctx = await templateContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!ctx.canManage) return NextResponse.json({ error: "Solo el propietario o un administrador puede crear tablas" }, { status: 403 });
  const body = await request.json().catch(() => null) as { familia?: unknown; tipo?: unknown; subtipo?: unknown } | null;
  if (typeof body?.familia !== "string" || typeof body.tipo !== "string") return NextResponse.json({ error: "Falta el tipo de documento" }, { status: 400 });
  try { return NextResponse.json({ plantilla: await proposeFor(ctx.workspaceId, { familia: body.familia, tipo: body.tipo, subtipo: typeof body.subtipo === "string" ? body.subtipo : null }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo proponer la tabla" }, { status: 502 }); }
}
