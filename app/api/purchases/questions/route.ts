import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { loadAnalyticsData } from "@/lib/analytics/data";
import { normalizePurchases } from "@/lib/purchases/analytics";
import { buildQuestions } from "@/lib/purchases/questions";
import { DecisionError, saveDecision } from "@/lib/purchases/decisions.service";
import { summarize } from "@/lib/purchases/rules";

/** The questions about the workspace's purchases (only what could not be fixed automatically), and their answers. */
async function questions(workspaceId: string) {
  const { lines, normalized } = normalizePurchases(await loadAnalyticsData(workspaceId));
  const all = buildQuestions(lines, normalized);
  const s = summarize(normalized);
  return { preguntas: all.slice(0, 30), total: all.length, resumen: { compras: s.total, corregidas_solas: s.auto, regalos: s.regalo } };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    return NextResponse.json(await questions(activeWorkspace.id));
  } catch (error) {
    console.error("[purchases] preguntas:", error);
    return NextResponse.json({ preguntas: [], total: 0 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { lineId?: unknown; unidades?: unknown; importe?: unknown; ignorar?: unknown };
  const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e7 ? v : undefined;
  const decision = { unidades: positive(body.unidades), importe: positive(body.importe), ignorar: body.ignorar === true ? true : undefined };
  if (typeof body.lineId !== "string" || (!decision.unidades && !decision.importe && !decision.ignorar)) return NextResponse.json({ error: "Respuesta no válida" }, { status: 400 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return NextResponse.json({ error: "Solo el propietario o un administrador puede confirmar compras." }, { status: 403 });
  try {
    await saveDecision({ workspaceId: activeWorkspace.id, userId: session.user.id, lineId: body.lineId, decision });
    return NextResponse.json(await questions(activeWorkspace.id));
  } catch (error) {
    if (error instanceof DecisionError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[purchases] respuesta:", error);
    return NextResponse.json({ error: "No se pudo guardar. No se ha cambiado nada." }, { status: 500 });
  }
}
