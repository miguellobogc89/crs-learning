import { NextResponse } from "next/server";
import { connectorContext } from "@/lib/connectors/context";
import { listTenders, normalizeFilters, saveReview } from "@/lib/tenders/service";
import { syncStatus, syncTenders } from "@/lib/tenders/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ action: string[] }> };

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request, route: RouteContext) {
  const ctx = await connectorContext();
  if (!ctx) return fail("No autenticado", 401);
  const action = (await route.params).action.join("/");
  try {
    if (action === "list") {
      const url = new URL(req.url);
      const [data, status] = await Promise.all([
        listTenders(ctx.workspaceId, normalizeFilters(url.searchParams)),
        syncStatus(),
      ]);
      return NextResponse.json({ ...data, sync: status, canSync: ctx.canManage });
    }
    return fail("No encontrado", 404);
  } catch (e) {
    console.error("[tenders] GET", action, e);
    return fail("No se pudieron cargar las licitaciones", 500);
  }
}

export async function POST(req: Request, route: RouteContext) {
  const ctx = await connectorContext();
  if (!ctx) return fail("No autenticado", 401);
  if (req.headers.get("origin") !== new URL(req.url).origin) return fail("Origen no permitido", 403);
  const action = (await route.params).action.join("/");
  try {
    if (action === "sync") {
      if (!ctx.canManage)
        return fail("Solo el propietario o un administrador puede actualizar las licitaciones", 403);
      return NextResponse.json(await syncTenders(45_000));
    }
    if (action === "review") {
      const raw = await req.text();
      if (raw.length > 16_384) return fail("Petición demasiado grande", 413);
      const body = JSON.parse(raw) as Record<string, unknown>;
      return NextResponse.json(await saveReview(ctx.workspaceId, ctx.userId, body));
    }
    return fail("No encontrado", 404);
  } catch (e) {
    console.error("[tenders] POST", action, e);
    return fail(e instanceof Error ? e.message : "No se pudo completar la operación", 500);
  }
}
