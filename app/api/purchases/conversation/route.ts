import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { ensureQuestionsConversation, questionsStatus } from "@/lib/purchases/conversation.service";

/** When the chat opens: the conversation with the pending questions about the purchases (created if needed). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    return NextResponse.json(await ensureQuestionsConversation(session.user.id, activeWorkspace.id));
  } catch (error) {
    console.error("[purchases] conversación:", error);
    return NextResponse.json({ conversationId: null, pendientes: 0, error: error instanceof Error ? error.message : String(error) });
  }
}

/** To check it from the browser: the state of the purchases and their questions (read-only). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    return NextResponse.json(await questionsStatus(session.user.id, activeWorkspace.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
