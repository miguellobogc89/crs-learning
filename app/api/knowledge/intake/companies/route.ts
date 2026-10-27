import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saved companies of the workspace (to answer "es la misma que…" when the importer has no suggestion). Read-only. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const type = await prisma.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: activeWorkspace.id, key: "company" } }, select: { id: true } });
  if (!type) return NextResponse.json({ empresas: [] });
  const rows = await prisma.engine_records.findMany({ where: { workspace_id: activeWorkspace.id, object_type_id: type.id, status: { not: "archived" } },
    select: { id: true, values_json: true }, take: 1000 });
  const empresas = rows.map((r: { id: string; values_json: unknown }) => {
    const v = (r.values_json && typeof r.values_json === "object" ? r.values_json : {}) as Record<string, unknown>;
    const name = [v.legal_name, v.trade_name].find(x => typeof x === "string" && x.trim()) as string | undefined;
    return { id: r.id, nombre: name ?? "Sin nombre", nif: typeof v.tax_identifier === "string" ? v.tax_identifier : null };
  }).sort((a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es"));
  return NextResponse.json({ empresas });
}
