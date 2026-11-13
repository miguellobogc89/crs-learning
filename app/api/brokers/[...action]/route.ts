// API del módulo de integraciones con brókeres. Solo habla con el gateway (lib/brokers/gateway):
// aquí no hay lógica de ningún proveedor. Las credenciales entran por POST y nunca salen.
import { NextResponse } from "next/server";
import { connectorContext } from "@/lib/connectors/context";
import * as brokers from "@/lib/brokers/gateway";
import { BrokerError, isBrokerError, type BrokerActor, type BrokerEnvironment, type BrokerPermission, type PlaceOrderInput } from "@/lib/brokers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ action: string[] }> };

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const fail = (message: string, status = 400, code = "invalid_request") => json({ error: message, code }, status);

function handle(e: unknown, action: string) {
  if (isBrokerError(e)) return json(e.toJSON(), e.httpStatus);
  if (e && typeof e === "object" && (e as { code?: unknown }).code === "P2021") {
    return fail("Faltan las tablas de integraciones: aplica la migración 20261111090000_broker_integrations", 500, "misconfigured");
  }
  if (e instanceof SyntaxError) return fail("JSON no válido");
  console.error("[brokers]", action, e);
  return fail("No se pudo completar la operación", 500, "provider_unavailable");
}

async function actorOf(): Promise<BrokerActor | null> {
  const ctx = await connectorContext();
  return ctx ? { kind: "user", userId: ctx.userId, workspaceId: ctx.workspaceId, canManage: ctx.canManage } : null;
}

export async function GET(req: Request, route: RouteContext) {
  const actor = await actorOf();
  if (!actor) return fail("No autenticado", 401, "forbidden");
  const action = (await route.params).action.join("/");
  const url = new URL(req.url);
  const connection = url.searchParams.get("connection") ?? "";
  try {
    if (action === "integrations") return json(await brokers.listIntegrations(actor));
    if (action === "log") return json({ items: await brokers.orderLog(actor, Number(url.searchParams.get("limit") ?? 30)) });
    if (action === "accounts") return json({ items: await brokers.getAccounts(actor, connection) });
    if (action === "positions") return json({ items: await brokers.getPositions(actor, connection) });
    if (action === "orders") return json({ items: await brokers.getOrders(actor, connection) });
    if (action === "executions") return json({ items: await brokers.getExecutions(actor, connection, Number(url.searchParams.get("limit") ?? 20)) });
    if (action === "instruments") return json({ items: await brokers.searchInstruments(actor, connection, url.searchParams.get("q") ?? "") });
    if (action === "order") return json({ order: await brokers.getOrder(actor, connection, url.searchParams.get("id") ?? "") });
    return fail("No encontrado", 404, "not_found");
  } catch (e) {
    return handle(e, action);
  }
}

const env = (v: unknown): BrokerEnvironment => {
  if (v !== "demo" && v !== "real") throw new BrokerError("invalid_request", "Indica el entorno: demo o real");
  return v;
};

export async function POST(req: Request, route: RouteContext) {
  const actor = await actorOf();
  if (!actor) return fail("No autenticado", 401, "forbidden");
  if (req.headers.get("origin") !== new URL(req.url).origin) return fail("Origen no permitido", 403, "forbidden");
  const action = (await route.params).action.join("/");
  try {
    const raw = await req.text();
    if (raw.length > 16_384) return fail("Petición demasiado grande", 413);
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const id = String(body.connectionId ?? "");

    if (action === "save-credentials") {
      return json(await brokers.saveCredentials(actor, {
        provider: String(body.provider ?? ""),
        environment: env(body.environment),
        credentials: body.credentials,
      }));
    }
    if (action === "connect") {
      return json(
        await brokers.connect(actor, {
          provider: String(body.provider ?? ""),
          environment: env(body.environment),
          credentials: body.credentials,
          useServerCredentials: body.useServerCredentials === true,
          useSavedCredentials: body.useSavedCredentials === true,
          permissions: Array.isArray(body.permissions) ? (body.permissions as BrokerPermission[]) : undefined,
        }),
      );
    }
    if (action === "disconnect") return json(await brokers.disconnect(actor, id));
    if (action === "permissions") return json(await brokers.setPermissions(actor, id, body.permissions));
    if (action === "verify") return json(await brokers.verify(actor, id));
    if (action === "use-for-trading") return json(await brokers.useForTrading(actor, body.connectionId ? id : null));
    if (action === "order") {
      // Confirmación explícita del entorno: una orden nunca cambia de demo a real por el camino.
      if (body.confirmEnvironment !== body.environment) return fail("Confirma explícitamente el entorno de la orden");
      const order: PlaceOrderInput = {
        connectionId: id,
        environment: env(body.environment),
        instrument: { symbol: String(body.symbol ?? ""), market: body.market === "crypto" ? "crypto" : "bolsa" },
        providerSymbol: typeof body.providerSymbol === "string" ? body.providerSymbol : null,
        side: body.side as PlaceOrderInput["side"], // validateOrder rechaza cualquier otro valor
        type: (["market", "limit", "stop", "stop_limit"].includes(String(body.type)) ? body.type : "market") as PlaceOrderInput["type"],
        quantity: Number(body.quantity),
        limitPrice: body.limitPrice == null ? null : Number(body.limitPrice),
        stopPrice: body.stopPrice == null ? null : Number(body.stopPrice),
        currency: typeof body.currency === "string" ? body.currency : null,
        idempotencyKey: String(body.idempotencyKey ?? ""),
        reference: "orden manual",
      };
      return json(await brokers.placeOrder(actor, order));
    }
    if (action === "cancel") return json(await brokers.cancelOrder(actor, id, String(body.orderId ?? "")));
    if (action === "refresh-order") return json(await brokers.refreshOrder(actor, String(body.requestId ?? "")));
    return fail("No encontrado", 404, "not_found");
  } catch (e) {
    return handle(e, action);
  }
}
