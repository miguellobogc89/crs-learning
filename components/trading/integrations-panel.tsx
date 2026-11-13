"use client";
// Integraciones: catálogo de brókeres y conexiones del usuario. Todo lo que se pinta sale del módulo
// central (/api/brokers): proveedores, capacidades, entornos, permisos y estado. Aquí no hay lógica
// de ningún bróker concreto. Las credenciales se envían una vez y no vuelven nunca al navegador.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Eye, KeyRound, Loader2, Plug, PlugZap, RefreshCw, ShieldAlert, Unplug } from "lucide-react";
import type { ConnectionView, ProviderView } from "@/lib/brokers/gateway";
import type { BrokerEnvironment, BrokerPermission, OrderStatus } from "@/lib/brokers/types";
import { errorText, field, ghost, panel, primary, th } from "./format";
import { refreshTrading } from "./navigation";
import { BrokerPanel } from "./broker-panel";
import { AccountModal } from "./integrations-account";
import { card, ErrorNote, LoadingCard, Modal, Pill } from "./ui";

type Data = { providers: ProviderView[]; connections: ConnectionView[]; realEnabled: boolean; canManage: boolean };
type LogItem = {
  id: string;
  provider: string;
  environment: string;
  actor: string;
  reference: string | null;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  status: OrderStatus;
  orderId: string | null;
  error: string | null;
  createdAt: string;
};

async function brokerApi<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/brokers/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data as T;
}

const CAPABILITY: Record<string, string> = {
  accounts: "Saldos",
  positions: "Posiciones",
  orders: "Órdenes abiertas",
  executions: "Historial",
  instruments: "Instrumentos",
  place_order: "Enviar órdenes",
  order_status: "Estado de órdenes",
  cancel_order: "Cancelar órdenes",
};
const ORDER_TYPE: Record<string, string> = { market: "a mercado", limit: "limitada", stop: "stop", stop_limit: "stop limitada" };
const PERMISSION: { key: BrokerPermission; label: string; text: string }[] = [
  { key: "read", label: "Leer", text: "Saldos, posiciones, órdenes e historial." },
  { key: "trade", label: "Operar", text: "Enviar y cancelar las órdenes que tú pidas." },
  { key: "auto", label: "Automático", text: "Que los automatismos de CRS (guardián del stop, modo automático) operen por ti." },
];
const STATUS_PILL: Record<ConnectionView["status"], { label: string; color: string }> = {
  active: { label: "Conectada", color: "emerald" },
  error: { label: "Con error", color: "orange" },
  disconnected: { label: "Desconectada", color: "slate" },
};
const ORDER_STATUS: Record<OrderStatus, string> = {
  pending_submit: "enviando",
  open: "abierta",
  partially_filled: "ejecutada en parte",
  filled: "ejecutada",
  cancelled: "cancelada",
  rejected: "rechazada",
  expired: "caducada",
  unknown: "sin confirmar",
};
const envLabel = (e: string) => (e === "real" ? "Real" : "Demo");
const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "—";

function Logo({ p, size = "h-10 w-10" }: { p: { logo: string | null; name: string }; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white`}>
      {p.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logotipos externos pequeños
        <img src={p.logo} alt="" className="h-6 w-6 object-contain" />
      ) : (
        <span className="text-xs font-bold text-slate-500">{p.name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

export function IntegrationsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [log, setLog] = useState<LogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<ProviderView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ c: ConnectionView; p: ProviderView } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([brokerApi<Data>("integrations"), brokerApi<{ items: LogItem[] }>("log?limit=20")]);
      setData(d);
      setLog(l.items);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, path: string, body: unknown, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    setError(null);
    try {
      await brokerApi(path, body);
      await load();
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;
  const available = data.providers.filter((p) => p.availability === "available");
  const soon = data.providers.filter((p) => p.availability === "soon");
  const trading = data.connections.find((c) => c.usedByTrading) ?? null;

  return (
    <div className="space-y-6">
      <section className={`${card} px-6 py-5`}>
        <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Plug className="h-5 w-5" />
          </span>
          Integraciones con brókeres
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Conecta tus cuentas para que CRS pueda leerlas y, si lo autorizas, enviar las órdenes que tú decidas. Cada conexión es tuya, con su
          entorno (demo o real) fijo y los permisos que elijas. Tus claves se guardan cifradas y nunca vuelven a la pantalla.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Conectar un bróker es una conexión técnica: CRS no gestiona tu dinero ni te asesora. Tú decides cada operación o qué automatismos
            permites.{" "}
            {data.realEnabled ? <b>Las cuentas con dinero real están habilitadas en este servidor.</b> : "Las cuentas con dinero real no están habilitadas: solo demo."}
          </span>
        </p>
        <div className="mt-3 text-sm text-slate-600">
          Cartera de Trading:{" "}
          {trading ? (
            <b className="text-slate-900">
              {data.providers.find((p) => p.id === trading.provider)?.name ?? trading.provider} · {envLabel(trading.environment)}
            </b>
          ) : (
            <span className="text-slate-500">sin bróker (solo el simulador)</span>
          )}
        </div>
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-5 lg:grid-cols-2">
        {available.map((p) => {
          const conns = data.connections.filter((c) => c.provider === p.id && c.status !== "disconnected");
          const freeEnvs = p.environments.filter((e) => (e !== "real" || data.realEnabled) && !conns.some((c) => c.environment === e));
          return (
            <article key={p.id} className={`${card} flex flex-col`}>
              <div className="flex items-start gap-3 px-6 pt-5">
                <Logo p={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-slate-900">{p.name}</h3>
                    <Pill color="emerald">Disponible</Pill>
                    {p.environments.map((e) => (
                      <Pill key={e} color={e === "real" ? "orange" : "blue"}>
                        {envLabel(e)}
                      </Pill>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{p.description}</p>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5 px-6">
                {p.capabilities.map((c) => (
                  <li key={c} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {CAPABILITY[c] ?? c}
                  </li>
                ))}
                {p.orderTypes.length > 0 && (
                  <li className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                    Órdenes {p.orderTypes.map((t) => ORDER_TYPE[t] ?? t).join(", ")}
                  </li>
                )}
                <li className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">{p.markets.map((m) => (m === "crypto" ? "Crypto" : "Bolsa")).join(" y ")}</li>
              </ul>

              <div className="mt-4 space-y-3 px-6">
                {conns.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    c={c}
                    canManage={data.canManage}
                    busy={busy}
                    onVerify={() => act(`verify:${c.id}`, "verify", { connectionId: c.id })}
                    onDisconnect={() =>
                      act(`disc:${c.id}`, "disconnect", { connectionId: c.id }, `¿Desconectar ${p.name} (${envLabel(c.environment)})? Se borran las claves guardadas; el historial de órdenes se conserva.`)
                    }
                    onPermissions={(perms) => act(`perm:${c.id}`, "permissions", { connectionId: c.id, permissions: perms })}
                    onUseForTrading={(use) => act(`use:${c.id}`, "use-for-trading", { connectionId: use ? c.id : null })}
                    onView={() => setViewing({ c, p })}
                  />
                ))}
                {!conns.length && <p className="text-sm text-slate-500">No tienes ninguna cuenta conectada.</p>}
              </div>

              {p.notes.length > 0 && (
                <ul className="mt-4 list-disc space-y-0.5 px-6 pl-10 text-xs text-slate-500">
                  {p.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              <footer className="mt-auto flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3 pt-3">
                {freeEnvs.length > 0 ? (
                  <button type="button" className={primary} onClick={() => setConnecting(p)}>
                    <PlugZap className="h-4 w-4" /> Conectar cuenta
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Ya tienes conectados todos los entornos disponibles.</span>
                )}
              </footer>
            </article>
          );
        })}
      </div>

      {soon.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Próximamente</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {soon.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
                <Logo p={p} size="h-9 w-9" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    {p.name} <Pill>Próximamente</Pill>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <BrokerPanel />

      <section className={`${panel} overflow-x-auto`}>
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-600" /> Registro de órdenes
          </h2>
          <p className="text-xs text-slate-500">Todo lo que se ha pedido a tus brókeres desde CRS, quién lo pidió y qué respondió el bróker.</p>
        </header>
        {!log?.length ? (
          <p className="px-5 py-6 text-sm text-slate-500">Aún no se ha enviado ninguna orden.</p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr>
                <th className={`${th} pl-5`}>Cuándo</th>
                <th className={th}>Bróker</th>
                <th className={th}>Orden</th>
                <th className={th}>Pedida por</th>
                <th className={th}>Estado</th>
                <th className={th}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {log.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 align-top">
                  <td className="py-2.5 pl-5 pr-3 text-slate-600">{when(o.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    {data.providers.find((p) => p.id === o.provider)?.name ?? o.provider} <span className="text-xs text-slate-500">· {envLabel(o.environment)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <b className="font-medium text-slate-900">
                      {o.side === "sell" ? "Venta" : "Compra"} {o.quantity} {o.symbol}
                    </b>{" "}
                    <span className="text-xs text-slate-500">{ORDER_TYPE[o.type] ?? o.type}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{o.actor}</td>
                  <td className="px-3 py-2.5">
                    <Pill color={o.status === "filled" || o.status === "open" ? "emerald" : o.status === "rejected" || o.status === "unknown" ? "orange" : "slate"}>
                      {ORDER_STATUS[o.status] ?? o.status}
                    </Pill>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {o.orderId ? `orden ${o.orderId}` : ""}
                    {o.error && <div className="text-red-700">{o.error}</div>}
                    {o.reference && <div>{o.reference}</div>}
                    {(o.status === "unknown" || o.status === "open" || o.status === "partially_filled" || o.status === "pending_submit") && (
                      <button
                        type="button"
                        className="mt-1 font-semibold text-blue-700 hover:underline disabled:opacity-50"
                        disabled={!!busy}
                        onClick={() => act(`refresh:${o.id}`, "refresh-order", { requestId: o.id })}
                      >
                        {busy === `refresh:${o.id}` ? "Consultando…" : "Consultar estado en el bróker"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {viewing && (
        <AccountModal
          c={viewing.c}
          provider={viewing.p}
          onClose={() => setViewing(null)}
          onChanged={() => {
            void load();
            refreshTrading();
          }}
        />
      )}
      {connecting && (
        <ConnectModal
          provider={connecting}
          taken={data.connections.filter((c) => c.provider === connecting.id && c.status !== "disconnected").map((c) => c.environment)}
          realEnabled={data.realEnabled}
          savedEnvironments={data.connections
            .filter((c) => c.provider === connecting.id && c.hasSavedCredentials)
            .map((c) => c.environment)}
          onStored={() => void load()}
          onClose={() => setConnecting(null)}
          onDone={async () => {
            setConnecting(null);
            await load();
            refreshTrading();
          }}
        />
      )}
    </div>
  );
}

function ConnectionRow({
  c,
  canManage,
  busy,
  onVerify,
  onDisconnect,
  onPermissions,
  onUseForTrading,
  onView,
}: {
  c: ConnectionView;
  canManage: boolean;
  busy: string | null;
  onVerify: () => void;
  onDisconnect: () => void;
  onPermissions: (p: BrokerPermission[]) => void;
  onUseForTrading: (use: boolean) => void;
  onView: () => void;
}) {
  const st = STATUS_PILL[c.status];
  const toggle = (k: BrokerPermission) => {
    const has = c.permissions.includes(k);
    // Operar implica leer y automático implica operar: al quitar uno, se quitan los que dependen de él.
    const next = has
      ? c.permissions.filter((p) => p !== k && !(k === "read" && p !== "read") && !(k === "trade" && p === "auto"))
      : [...c.permissions, k];
    onPermissions(next);
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill color={st.color}>{st.label}</Pill>
          <Pill color={c.environment === "real" ? "orange" : "blue"}>{envLabel(c.environment)}</Pill>
          <b className="font-semibold text-slate-900">{c.accountLabel ?? "Cuenta"}</b>
          {c.currency && <span className="text-xs text-slate-500">{c.currency}</span>}
          {c.credentialsSource === "server" ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Usa la clave configurada en el servidor (solo desarrollo)">
              <KeyRound className="h-3.5 w-3.5" /> clave del servidor
            </span>
          ) : c.hasSavedCredentials ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700" title="API key guardada cifrada en el servidor">
              <KeyRound className="h-3.5 w-3.5" /> API key guardada
            </span>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          {c.status === "active" && (
            <button type="button" className={ghost} onClick={onView}>
              <Eye className="h-4 w-4" /> Ver cuenta
            </button>
          )}
          <button type="button" className={ghost} title="Comprobar la conexión" disabled={!!busy} onClick={onVerify}>
            {busy === `verify:${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button type="button" className={`${ghost} text-red-700`} disabled={!!busy} onClick={onDisconnect}>
            {busy === `disc:${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Desconectar
          </button>
        </div>
      </div>
      {c.lastError && <p className="mt-2 text-xs text-red-700">{c.lastError}</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Permisos">
        {PERMISSION.map((p) => {
          const on = c.permissions.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              title={p.text}
              disabled={!!busy || c.status !== "active"}
              onClick={() => toggle(p.key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 ${on ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"}`}
            >
              {on && <CheckCircle2 className="h-3.5 w-3.5" />}
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Comprobada {when(c.lastCheckedAt)}</span>
        {c.usedByTrading ? (
          <span className="inline-flex items-center gap-2">
            <Pill color="violet">Usada por la cartera de Trading</Pill>
            {canManage && (
              <button type="button" className="font-medium text-slate-600 hover:underline" disabled={!!busy} onClick={() => onUseForTrading(false)}>
                Quitar
              </button>
            )}
          </span>
        ) : (
          canManage &&
          c.status === "active" && (
            <button type="button" className="font-semibold text-blue-700 hover:underline" disabled={!!busy} onClick={() => onUseForTrading(true)}>
              Usar para la cartera de Trading
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ConnectModal({
  provider,
  taken,
  realEnabled,
  savedEnvironments,
  onStored,
  onClose,
  onDone,
}: {
  provider: ProviderView;
  taken: BrokerEnvironment[];
  realEnabled: boolean;
  savedEnvironments: BrokerEnvironment[];
  onStored: () => void;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const envs = provider.environments.filter((e) => (e !== "real" || realEnabled) && !taken.includes(e));
  const [environment, setEnvironment] = useState<BrokerEnvironment>(envs[0] ?? "demo");
  const [useServer, setUseServer] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [perms, setPerms] = useState<BrokerPermission[]>(["read"]);
  const [realOk, setRealOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storing, setStoring] = useState(false);
  const [storedLocally, setStoredLocally] = useState<BrokerEnvironment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const filled = provider.credentialFields.every((f) => (values[f.key] ?? "").trim());
  const empty = provider.credentialFields.every((f) => !(values[f.key] ?? "").trim());
  const hasSaved = savedEnvironments.includes(environment) || storedLocally.includes(environment);
  const useSaved = !useServer && hasSaved && empty;
  const complete = (useServer || filled || useSaved) && (environment !== "real" || realOk);

  const storeCredentials = async () => {
    if (!filled || storing || saving || useServer) return;
    setStoring(true);
    setError(null);
    try {
      await brokerApi("save-credentials", { provider: provider.id, environment, credentials: values });
      setStoredLocally((current) => [...new Set([...current, environment])]);
      setValues({});
      onStored();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStoring(false);
    }
  };

  const save = async () => {
    if (!complete || saving || storing) return;
    setSaving(true);
    setError(null);
    try {
      await brokerApi("connect", {
        provider: provider.id,
        environment,
        credentials: useServer || useSaved ? undefined : values,
        useServerCredentials: useServer,
        useSavedCredentials: useSaved,
        permissions: perms,
      });
      setValues({});
      await onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <Logo p={provider} size="h-8 w-8" /> Conectar {provider.name}
        </span>
      }
      subtitle="Se comprueba leyendo tu saldo: no se envía ninguna orden."
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          {!useServer && (
            <button type="button" className={ghost} disabled={!filled || saving || storing || !envs.length} onClick={() => void storeCredentials()}>
              {storing && <Loader2 className="h-4 w-4 animate-spin" />} Guardar API key
            </button>
          )}
          <button type="button" className={primary} disabled={!complete || saving || storing || !envs.length} onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Conectar
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-600">Entorno (no se puede cambiar después)</div>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {envs.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEnvironment(e);
                  setValues({});
                  setUseServer(false);
                  setError(null);
                }}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${environment === e ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {e === "real" ? "Real (dinero de verdad)" : "Demo (dinero ficticio)"}
              </button>
            ))}
          </div>
        </div>

        {provider.serverCredentials && environment === "demo" && (
          <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <input type="checkbox" className="mt-1" checked={useServer} onChange={(e) => setUseServer(e.target.checked)} />
            <span>
              <b>Usar la clave configurada en el servidor</b> (solo en local, solo demo). No se guarda ninguna clave en la base de datos.
            </span>
          </label>
        )}

        {!useServer &&
          provider.credentialFields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-medium text-slate-600">{f.label}</span>
              <input
                className={`${field} mt-1 w-full`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.help && <span className="mt-1 block text-xs text-slate-500">{f.help}</span>}
            </label>
          ))}
        {!useServer && hasSaved && (
          <p className="flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            API key guardada cifrada. Deja los campos vacíos y pulsa Conectar para reutilizarla.
          </p>
        )}
        {!useServer && !hasSaved && (
          <p className="text-xs text-slate-500">
            Puedes guardar la API key sin conectar todavía. Quedará cifrada en tu cuenta y no tendrás que introducirla otra vez.
          </p>
        )}

        {environment === "real" && (
          <label className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900">
            <input type="checkbox" className="mt-1" checked={realOk} onChange={(e) => setRealOk(e.target.checked)} />
            <span>
              <b>Es mi cuenta con dinero real.</b> Empiezo solo con permiso de lectura y mi clave no tiene los retiros habilitados.
            </span>
          </label>
        )}

        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-600">Qué permites a CRS</div>
          <div className="space-y-1.5">
            {PERMISSION.map((p) => {
              const on = perms.includes(p.key);
              return (
                <label key={p.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={on}
                    disabled={p.key === "read"}
                    onChange={() =>
                      setPerms((list) => (on ? list.filter((x) => x !== p.key && !(p.key === "trade" && x === "auto")) : [...new Set([...list, p.key, ...(p.key === "auto" ? (["trade"] as BrokerPermission[]) : [])])]))
                    }
                  />
                  <span>
                    <b>{p.label}</b> <span className="text-slate-500">· {p.text}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  );
}
