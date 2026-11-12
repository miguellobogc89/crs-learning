import { after, NextResponse } from "next/server";
import { getWallets, myAgents } from "@/lib/trading/wallets";
import { connectorContext } from "@/lib/connectors/context";
import {
  accountDetail,
  closePosition,
  openAccount,
  parseOrder,
  placeOrder,
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
import { decideProposal, executeProposalOnBroker, getCommittee, runCommittee } from "@/lib/trading/committee/service";
import { canDirectAgents, getAgents, maybeRunAgents, resetAgent, runAgent } from "@/lib/trading/agents/service";
import { getPortfolio, setCopy, stopCopy } from "@/lib/trading/agents/copy";
import { getOpportunities } from "@/lib/trading/agents/opportunities";
import { brokerLinks, brokerStatus, linkInstruments, listBrackets, runBrokerGuardian, setBrokerAutonomy } from "@/lib/trading/broker/service";
import { isBrokerError, type BrokerActor } from "@/lib/brokers/types";
import { refreshLive } from "@/lib/trading/live";
import { kamikazeTick } from "@/lib/trading/kamikaze/engine";
import { faroView } from "@/lib/trading/faro/engine";
import { closeMirrorPositions, mirrorView, setMirror, stopMirror } from "@/lib/trading/mirror/service";

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
  "Faltan tablas de trading en la base de datos: ejecuta las migraciones de prisma/migrations que empiezan por 20261110 y 20261111 (trading, noticias, comité e integraciones de brókeres)";
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
    if (action === "mine") return NextResponse.json(await myAgents(ctx.workspaceId));
    if (action === "wallets") {
      return NextResponse.json(await getWallets({ kind: "user", userId: ctx.userId, workspaceId: ctx.workspaceId, canManage: ctx.canManage }));
    }
    if (action === "status") {
      // Con la bolsa abierta: precio en directo y órdenes pendientes ejecutadas en la apertura (si toca).
      const live = await refreshLive(6_000).catch((e) => {
        console.error("[trading] live", e);
        return null;
      });
      // Y, sin hacer esperar a la pantalla, la reunión del agente al que le toque (si le toca).
      after(() => maybeRunAgents().catch((e) => console.error("[trading] reunión de agentes", e)));
      // Los kamikazes: vigilancia cada pocos minutos y su decisión con IA cuando les toca.
      after(() => kamikazeTick().catch((e) => console.error("[trading] kamikazes", e)));
      return NextResponse.json({ ...(await getStatus(ctx.workspaceId)), canManage: ctx.canManage, live });
    }
    if (action === "news") return NextResponse.json({ ...(await listNews(normalizeNewsFilters(url.searchParams))), canManage: ctx.canManage });
    if (action === "committee") return NextResponse.json({ ...(await getCommittee(ctx.workspaceId)), canManage: ctx.canManage });
    if (action === "library") return NextResponse.json(await getLibrary(url.searchParams.get("market") === "crypto" ? "crypto" : "bolsa"));
    if (action === "broker") {
      const status = await brokerStatus(ctx.workspaceId);
      return NextResponse.json({
        ...status,
        brackets: status.available ? await listBrackets(ctx.workspaceId) : [],
        links: status.available ? await brokerLinks() : [],
        canManage: ctx.canManage,
      });
    }
    if (action === "account") return NextResponse.json(await accountDetail(ctx.workspaceId));
    if (action === "opportunities") return NextResponse.json(await getOpportunities(ctx.workspaceId));
    if (action === "faro") return NextResponse.json(await faroView(ctx.workspaceId));
    if (action === "mirror") return NextResponse.json({ ...(await mirrorView(ctx.workspaceId)), canManage: ctx.canManage });
    if (action === "agents") return NextResponse.json({ ...(await getAgents(ctx.workspaceId)), canManage: canDirectAgents(ctx.workspaceId), canCopy: ctx.canManage });
    if (action === "portfolio") return NextResponse.json(await getPortfolio(ctx.workspaceId));
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
    if (isBrokerError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus });
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
    if (action === "agents/run" || action === "agents/reset") {
      if (!canDirectAgents(ctx.workspaceId)) return fail("Los agentes son de toda la plataforma: solo los dirige su administrador", 403);
      const agent = String(body.agent ?? "");
      if (action === "agents/run") return NextResponse.json(await runAgent(agent, ctx.userId));
      await resetAgent(agent);
      return NextResponse.json({ ok: true });
    }
    if (action === "account/open") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede abrir la cuenta del espacio", 403);
      await openAccount(ctx.workspaceId, body.capital);
      return NextResponse.json({ ok: true });
    }
    if (action === "copy/set") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede cambiar las copias", 403);
      return NextResponse.json(await setCopy(ctx.workspaceId, body.agent, body.weightPct, body.mirror === true));
    }
    if (action === "copy/stop") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede cambiar las copias", 403);
      await stopCopy(ctx.workspaceId, body.agent);
      return NextResponse.json({ ok: true });
    }
    if (action === "mirror/set" || action === "mirror/stop" || action === "mirror/close") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede copiar agentes en el bróker", 403);
      if (action === "mirror/set") return NextResponse.json(await setMirror(ctx.workspaceId, body));
      if (action === "mirror/close") return NextResponse.json(await closeMirrorPositions(ctx.workspaceId, body.agent));
      return NextResponse.json(await stopMirror(ctx.workspaceId, body.agent));
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
    if (action === "committee/execute-broker" || action === "broker/link" || action === "broker/guardian" || action === "broker/autonomy") {
      if (!ctx.canManage) return fail("Solo el propietario o un administrador puede operar con el bróker", 403);
      // Quien lo pide tiene que ser el dueño de la conexión del bróker (lo comprueba el gateway).
      const requester: BrokerActor = { kind: "user", userId: ctx.userId, workspaceId: ctx.workspaceId, canManage: ctx.canManage };
      if (action === "committee/execute-broker") {
        if (body.confirmDemo !== true) return fail("Falta la confirmación explícita de la operación");
        return NextResponse.json(await executeProposalOnBroker(ctx.workspaceId, String(body.proposalId ?? ""), "comite", requester));
      }
      if (action === "broker/link") return NextResponse.json(await linkInstruments(ctx.workspaceId, requester));
      if (action === "broker/guardian") return NextResponse.json(await runBrokerGuardian(ctx.workspaceId));
      return NextResponse.json(await setBrokerAutonomy(ctx.workspaceId, body.autonomy));
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
      await openAccount(ctx.workspaceId, body.capital);
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
    if (isBrokerError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    console.error("[trading] POST", action, e);
    if (missingTables(e)) return fail(MIGRATION_HINT, 500);
    if (e instanceof SyntaxError) return fail("JSON no válido");
    return fail(message(e), 400);
  }
}
