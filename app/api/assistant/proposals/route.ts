import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { decideProposal } from "@/lib/assistant/changes/service";
import { ApplyError } from "@/lib/assistant/changes/apply";

export const maxDuration = 60;

/** «Aplicar», «Descartar» or «Deshacer» a change proposed by the assistant in the chat. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { messageId?: unknown; proposalId?: unknown; accion?: unknown };
  if (typeof body.messageId !== "string" || typeof body.proposalId !== "string" || !["aplicar", "descartar", "deshacer"].includes(String(body.accion))) {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  try {
    const { proposal, message } = await decideProposal({ workspaceId: activeWorkspace.id, userId: session.user.id,
      canWrite: activeWorkspace.role === "owner" || activeWorkspace.role === "admin",
      messageId: body.messageId, proposalId: body.proposalId, accion: body.accion as "aplicar" | "descartar" | "deshacer" });
    const { undo: _undo, operaciones: _ops, ...visible } = proposal;
    return NextResponse.json({ proposal: visible, message: message ?? null });
  } catch (error) {
    if (error instanceof ApplyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[assistant] propuesta:", error);
    return NextResponse.json({ error: "No se pudo completar. No se ha cambiado nada." }, { status: 500 });
  }
}
