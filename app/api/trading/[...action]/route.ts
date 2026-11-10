import { NextResponse } from "next/server";
import { connectorContext } from "@/lib/connectors/context";
import {
  accountDetail,
  closePosition,
  parseOrder,
  placeOrder,
  resetAccount,
  updateSettings,
  updateStops,
} from "@/lib/trading/accounts";
import {
  addInstrument,
  getInstrument,
  getLibrary,
  getOverview,
  getStatus,
  listInstruments,
  runDaily,
  setInstrumentActive,
  simulate,
} from "@/lib/trading/service";
import { listNews, normalizeNewsFilters, syncNews } from "@/lib/trading/news/service";
import { decideProposal, getCommittee, runCommittee } from "@/lib/trading/committee/service";
import { getTrading212DemoOrders, getTrading212DemoPositions, getTrading212DemoSummary, Trading212Error } from "@/lib/trading/trading212";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ action: string[] }> };

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
/** Prisma P2021: la tabla no existe (falta aplicar la migración). */
function missingTables(e: unknown) {
  return !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2021";
}
const MIGRATION_HINT =
  "Faltan tablas de trading en la base de datos: ejecuta las migraciones de prisma/migrations que empiezan por 20261110 (trading, trading_news y trading_committee)";
const message = (e: unknown) => (e instanceof Error ? e.message.slice(0, 400) : "No se pudo completar la operación");

export async function GET(req: Request, route: RouteContext) {
  const ctx = await connectorContext();
  if (!ctx) return fail("No autenticado", 401);
  const action = (await route.params).action.join("/");
  const url = new URL(req.url);
  try {
    if (action === "overview") return NextResponse.json({ ...(await getOverview(ctx.workspaceId)), canManage: ctx.canManage });
    if (action === "instrument") {
      const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
      if (!symbol) return fail("Falta el valor");
      return NextResponse.json(await getInstrument(ctx.workspaceId, symbol));
    }
    if (action === "status") return NextResponse.json({ ...(await getStatus(ctx.workspaceId)), canManage: ctx.canManage });
    if (action === "news") return NextResponse.json({ ...(await listNews(normalizeNewsFilters(url.searchParams))), canManage: ctx.canManage });
    if (action === "committee") return NextResponse.json({ ...(await getCommittee(ctx.workspaceId)), canManage: ctx.canManage });
    if (action === "library") return NextResponse.json(await getLibrary(url.searchParams.get("market") === "crypto" ? "crypto" : "bolsa"));
    if (action === "trading212/account" || action === "trading212/positions" || action === "trading212/orders") {
      // Clave personal de Demo: no debe exponerse en entornos desplegados ni a usuarios del workspace.
      if (process.env.NODE_ENV !== "development") return fail("Solo disponible en desarrollo local", 403);
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede consultar Trading 212", 403);
      try {
        const data = action === "trading212/account"
          ? await getTrading212DemoSummary()
          : action === "trading212/positions"
            ? await getTrading212DemoPositions()
            : await getTrading212DemoOrders();
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
      } catch (e) {
        if (e instanceof Trading212Error) return fail(e.message, e.status);
        throw e;
      }
    }
    if (action === "account") return NextResponse.json(await accountDetail(ctx.workspaceId));
    if (action === "instruments") {
      const list = await listInstruments();
      return NextResponse.json({
        items: list.map((i) => ({
          symbol: i.symbol,
          name: i.name,
          sector: i.sector,
          isIndex: i.is_index,
          active: i.active,
          lastCandle: i.last_candle_at?.toISOString().slice(0, 10) ?? null,
          lastError: i.last_error,
        })),
        canManage: ctx.canManage,
      });
    }
    return fail("No encontrado", 404);
  } catch (e) {
    console.error("[trading] GET", action, e);
    if (missingTables(e)) return fail(MIGRATION_HINT, 500);
    return fail(message(e), 500);
  }
}

export async function POST(req: Request, route: RouteContext) {
  const ctx = await connectorContext();
  if (!ctx) return fail("No autenticado", 401);
  if (req.headers.get("origin") !== new URL(req.url).origin) return fail("Origen no permitido", 403);
  const action = (await route.params).action.join("/");
  try {
    const raw = await req.text();
    if (raw.length > 16_384) return fail("Petición demasiado grande", 413);
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;

    if (action === "sync") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede actualizar las cotizaciones", 403);
      return NextResponse.json(await runDaily(45_000, ctx.workspaceId));
    }
    if (action === "news/sync") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede actualizar las noticias", 403);
      return NextResponse.json(await syncNews(45_000));
    }
    if (action === "committee/run") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede convocar al comité", 403);
      return NextResponse.json(await runCommittee(ctx.workspaceId, ctx.userId));
    }
    if (action === "committee/decide") {
      const decision = body.decision === "descartar" ? "descartar" : "ejecutar";
      const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
      return NextResponse.json(
        await decideProposal(ctx.workspaceId, ctx.userId, String(body.proposalId ?? ""), decision, {
          quantity: num(body.quantity),
          stop: num(body.stop),
          target: num(body.target),
          execution: body.execution === "now" ? "now" : "next_open",
        }),
      );
    }
    if (action === "simulate") return NextResponse.json(await simulate(ctx.workspaceId, body));
    if (action === "order") return NextResponse.json(await placeOrder(ctx.workspaceId, ctx.userId, parseOrder(body)));
    if (action === "close") return NextResponse.json(await closePosition(ctx.workspaceId, String(body.positionId ?? "")));
    if (action === "stops") return NextResponse.json(await updateStops(ctx.workspaceId, String(body.positionId ?? ""), body));
    if (action === "settings") {
      await updateSettings(ctx.workspaceId, body);
      return NextResponse.json({ ok: true });
    }
    if (action === "reset") {
      if (body.confirm !== true) return fail("Falta la confirmación");
      await resetAccount(ctx.workspaceId, body.capital);
      return NextResponse.json({ ok: true });
    }
    if (action === "instruments") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede cambiar los valores seguidos", 403);
      if (body.op === "add") return NextResponse.json(await addInstrument(body.symbol, body.name));
      if (body.op === "toggle" && typeof body.symbol === "string") {
        await setInstrumentActive(body.symbol, body.active === true);
        return NextResponse.json({ ok: true });
      }
      return fail("Operación no válida");
    }
    return fail("No encontrado", 404);
  } catch (e) {
    console.error("[trading] POST", action, e);
    if (missingTables(e)) return fail(MIGRATION_HINT, 500);
    if (e instanceof SyntaxError) return fail("JSON no válido");
    return fail(message(e), 400);
  }
}
