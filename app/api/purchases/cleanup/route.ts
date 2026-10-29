import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { applyCleanup, CleanupError } from "@/lib/purchases/cleanup.service";

export const maxDuration = 300;

/** «Corregir»: writes back into the purchase lines what their own figures prove (lib/purchases/cleanup). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return NextResponse.json({ error: "Solo el propietario o un administrador puede corregir compras." }, { status: 403 });
  try {
    return NextResponse.json(await applyCleanup({ workspaceId: activeWorkspace.id, userId: session.user.id }));
  } catch (error) {
    if (error instanceof CleanupError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[purchases] limpieza:", error);
    return NextResponse.json({ error: "No se pudo completar. No se ha cambiado nada más." }, { status: 500 });
  }
}
