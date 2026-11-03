import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { AgentError, answerProposal } from "@/lib/purchases/agent.service";

export const maxDuration = 120;

/** An owner's answer to a proposal of the correction agent: { id, decision: "aplicar" | "descartar" }. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return NextResponse.json({ error: "Solo el propietario o un administrador puede responder al agente." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: unknown; decision?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const decision = body?.decision === "aplicar" || body?.decision === "descartar" ? body.decision : null;
  if (!id || id.length > 200 || !decision) return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  try {
    return NextResponse.json(await answerProposal({ workspaceId: activeWorkspace.id, userId: session.user.id, id, decision }));
  } catch (error) {
    if (error instanceof AgentError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[purchases] agente:", error);
    return NextResponse.json({ error: "No se pudo completar. No se ha cambiado nada." }, { status: 500 });
  }
}
