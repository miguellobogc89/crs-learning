"use client";
// Conexiones: catálogo de brókeres y conexiones del usuario. Todo lo que se pinta sale del módulo
// central (/api/brokers): proveedores, capacidades, entornos, permisos y estado. Aquí no hay lógica
// de ningún bróker concreto. Las credenciales se envían una vez y no vuelven nunca al navegador.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Eye, Info, Loader2, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const connectionsByProvider = new Map<string, ConnectionView[]>();
  for (const connection of data.connections) {
    if (connection.status === "disconnected") continue;
    const existing = connectionsByProvider.get(connection.provider) ?? [];
    connectionsByProvider.set(connection.provider, [...existing, connection]);
  }
  const isConnected = (provider: ProviderView) => (connectionsByProvider.get(provider.id) ?? []).some((c) => c.status === "active");
  const available = data.providers.filter((p) => p.availability === "available")
    .sort((a, b) => Number(isConnected(b)) - Number(isConnected(a)));
  const soon = data.providers.filter((p) => p.availability === "soon");

  return (
    <div className="space-y-6">
      {error && <ErrorNote>{error}</ErrorNote>}

      <TooltipProvider delayDuration={150}>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {available.map((p) => {
            const conns = connectionsByProvider.get(p.id) ?? [];
            const freeEnvs = p.environments.filter((e) => (e !== "real" || data.realEnabled) && !conns.some((c) => c.environment === e));
            return (
              <article key={p.id} className={`${card} space-y-3 p-4`}>
                <div className="flex items-center gap-2.5">
                  <Logo p={p} size="h-9 w-9" />
                  <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{p.name}</h2>
                  {!conns.length && <Pill>Desconectada</Pill>}
                  <ConnectionInfo provider={p} connections={conns} realEnabled={data.realEnabled} />
                </div>
                {p.fees && <Fees fees={p.fees} />}
                {conns.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    c={c}
                    showEnvironment={p.environments.length > 1}
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
                {freeEnvs.length > 0 && (
                  <div className="flex justify-end">
                    <button type="button" className={ghost} onClick={() => setConnecting(p)}>
                      <PlugZap className="h-4 w-4" /> {conns.length ? "Conectar otro entorno" : "Conectar"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </TooltipProvider>

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
          onDone={async (created) => {
            const p = connecting;
            setConnecting(null);
            await load();
            refreshTrading();
            // Exchanges con efectivo en USDC: se abre la cuenta para ofrecer el cambio de euros a USDC.
            if (created && p && p.cashCurrencies?.includes("USDC")) setViewing({ c: created, p });
          }}
        />
      )}
    </div>
  );
}

function ConnectionInfo({ provider, connections, realEnabled }: { provider: ProviderView; connections: ConnectionView[]; realEnabled: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`Información de ${provider.name}`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <Info className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" sideOffset={6} className="max-h-[min(26rem,var(--radix-tooltip-content-available-height))] overflow-y-auto">
        <div className="space-y-2">
          <p>{provider.description}</p>
          <p>{[provider.markets.map((m) => m === "crypto" ? "Cripto" : "Bolsa").join(" y "), provider.environments.map(envLabel).join(" / ")].join(" · ")}</p>
          <p>{provider.capabilities.map((capability) => CAPABILITY[capability] ?? capability).join(" · ")}</p>
          {provider.orderTypes.length > 0 && <p>Órdenes {provider.orderTypes.map((type) => ORDER_TYPE[type] ?? type).join(", ")}.</p>}
          {!realEnabled && provider.environments.includes("real") && <p>Las conexiones con dinero real están deshabilitadas en este servidor.</p>}
          {provider.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {provider.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
          {connections.map((connection) => (
            <p key={connection.id} className="border-t border-current/20 pt-2">
              {envLabel(connection.environment)} · {connection.accountLabel ?? "Cuenta"}{connection.currency && ` · ${connection.currency}`}
              {connection.lastCheckedAt && <><br />Comprobada {when(connection.lastCheckedAt)}</>}
              {connection.credentialsSource === "server" ? <><br />Clave del servidor (solo desarrollo)</> : connection.hasSavedCredentials ? <><br />Clave API guardada y cifrada</> : null}
              {connection.lastError && <><br />{connection.lastError}</>}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const actionPill = (on = false) => `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${on ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

function ConnectionRow({
  c, showEnvironment, canManage, busy, onVerify, onDisconnect, onPermissions, onUseForTrading, onView,
}: {
  c: ConnectionView;
  showEnvironment: boolean;
  canManage: boolean;
  busy: string | null;
  onVerify: () => void;
  onDisconnect: () => void;
  onPermissions: (p: BrokerPermission[]) => void;
  onUseForTrading: (use: boolean) => void;
  onView: () => void;
}) {
  const active = c.status === "active";
  const toggle = (k: BrokerPermission) => {
    const has = c.permissions.includes(k);
    const next = has
      ? c.permissions.filter((p) => p !== k && !(k === "read" && p !== "read") && !(k === "trade" && p === "auto"))
      : [...c.permissions, k];
    onPermissions(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <Pill color={active ? "emerald" : "slate"}>{active ? "Conectada" : "Desconectada"}{showEnvironment && ` · ${envLabel(c.environment)}`}</Pill>
      {active ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Acciones y permisos de la cuenta ${envLabel(c.environment)}`}>
          <button type="button" className={actionPill()} onClick={onView}>
            <Eye className="size-3.5" /> Ver cuenta
          </button>
          {PERMISSION.map((p) => {
            const on = c.permissions.includes(p.key);
            return (
              <button key={p.key} type="button" title={p.text} disabled={!!busy} onClick={() => toggle(p.key)}
                aria-pressed={on} className={actionPill(on)}>
                {on && <CheckCircle2 className="size-3.5" />}
                {p.label}
              </button>
            );
          })}
          {(canManage || c.usedByTrading) && (
            <button type="button" className={actionPill(c.usedByTrading)}
              title="Usar para la cartera de Trading" aria-pressed={c.usedByTrading}
              disabled={!!busy || !canManage} onClick={() => onUseForTrading(!c.usedByTrading)}>
              {c.usedByTrading && <CheckCircle2 className="size-3.5" />}
              Cartera
            </button>
          )}
        </div>
      ) : (
        <button type="button" className={actionPill()} disabled={!!busy} onClick={onVerify}>
          {busy === `verify:${c.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Reintentar
        </button>
      )}
      <button type="button" className={`${ghost} ml-auto text-red-700`} disabled={!!busy} onClick={onDisconnect}>
        {busy === `disc:${c.id}` ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
        Desconectar
      </button>
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
  onDone: (created?: ConnectionView) => void | Promise<void>;
}) {
  const envs = provider.environments.filter((e) => (e !== "real" || realEnabled) && !taken.includes(e));
  const [environment, setEnvironment] = useState<BrokerEnvironment>(envs[0] ?? "demo");
  const [useServer, setUseServer] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  // Operativa desde el principio: leer, operar y automatismos (Oportunidades y copias). Se pueden quitar.
  const [perms, setPerms] = useState<BrokerPermission[]>(["read", "trade", "auto"]);
  const [realOk, setRealOk] = useState(false);
  const [remember, setRemember] = useState(true);
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
      // «Recordar»: se guarda cifrada antes de conectar, así se conserva aunque la conexión falle.
      if (remember && !useServer && !useSaved && filled) {
        await brokerApi("save-credentials", { provider: provider.id, environment, credentials: values });
        setStoredLocally((current) => [...new Set([...current, environment])]);
        onStored();
      }
      const created = await brokerApi<ConnectionView>("connect", {
        provider: provider.id,
        environment,
        credentials: useServer || useSaved ? undefined : values,
        useServerCredentials: useServer,
        useSavedCredentials: useSaved,
        permissions: perms,
      });
      setValues({});
      await onDone(created);
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
      subtitle="Guardar cifra la API key sin conectarte. Conectar verifica tus credenciales leyendo el saldo, sin enviar órdenes."
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
        {!useServer && !useSaved && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              <b>Recordar API key</b>: se guarda cifrada en tu cuenta aunque la conexión falle, para no tener que volver a pegarla.
            </span>
          </label>
        )}
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
              <b>Es mi cuenta con dinero real</b> y mi clave no tiene los retiros habilitados. Con «Operar» y «Automático» la app podrá comprar y vender por mí (Oportunidades y copias).
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

const feePct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;

/** Comisión por compra o venta: la que pagan las copias (al momento) y la de las órdenes que esperan. */
function Fees({ fees }: { fees: NonNullable<ProviderView["fees"]> }) {
  return (
    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" title={`Fuente: ${fees.source}${fees.note ? `. ${fees.note}` : ""}`}>
      <b className="font-semibold text-slate-900">Comisión {feePct(fees.taker)}</b> por compra o venta al momento (como las copias)
      {fees.maker !== fees.taker && <> · {feePct(fees.maker)} con órdenes que esperan</>}
      {fees.note && <span className="block text-[11px] text-slate-400">{fees.note}</span>}
    </p>
  );
}

