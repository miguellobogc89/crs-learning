import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { loadAnalyticsData } from "@/lib/analytics/data";
import { purchaseReviews } from "@/lib/analytics/compute";
import { summarize } from "@/lib/purchases/review";

/** Where the purchase review stands, for the chat to bring it up when it opens. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    const data = await loadAnalyticsData(activeWorkspace.id);
    if (!data.lines.length) return NextResponse.json({ total: 0, correcciones: 0, dudas: 0 });
    const s = summarize(purchaseReviews(data));
    return NextResponse.json({ total: s.total, correcciones: s.porEstado.corregible + s.porEstado.regalo, dudas: s.porEstado.duda + s.porEstado.faltan });
  } catch (error) {
    console.error("[assistant] resumen de revisión:", error);
    return NextResponse.json({ total: 0, correcciones: 0, dudas: 0 });
  }
}
