import { NextResponse } from "next/server";
import { refreshIntakeAlerts } from "@/lib/knowledge/intake/alerts/service";
import { templateContext } from "@/lib/knowledge/intake/templates/access";
import { createTemplate, templateOverview } from "@/lib/knowledge/intake/templates/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Document types without a table (and how far each template has got). */
export async function GET() {
  const ctx = await templateContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ ...(await templateOverview(ctx.workspaceId)), canManage: ctx.canManage });
}

/** Accept a (reviewed) template: creates its table. Documents are processed one by one afterwards. */
export async function POST(request: Request) {
  const ctx = await templateContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!ctx.canManage) return NextResponse.json({ error: "Solo el propietario o un administrador puede crear tablas" }, { status: 403 });
  try {
    const created = await createTemplate(ctx.workspaceId, ctx.userId, (await request.json().catch(() => null))?.plantilla);
    refreshIntakeAlerts(ctx.workspaceId);
    return NextResponse.json(created, { status: 201 });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la tabla" }, { status: 400 }); }
}
