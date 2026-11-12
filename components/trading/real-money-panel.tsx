"use client";
// Mi cartera → Dinero real: tus exchanges y qué agente mueve cuánto dinero tuyo en ellos.
// Todo se gestiona desde aquí: dar dinero a un agente, cambiar el importe o quitárselo.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Link2, Loader2, Pause, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import type { getWallets } from "@/lib/trading/wallets";
import type { mirrorView } from "@/lib/trading/mirror/service";
import { api, dayFmt, errorText, eur, field, ghost, primary, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { AgentAvatar, card, ErrorNote, LoadingCard, Modal, Pill } from "./ui";
import { AssetIcon } from "./asset-icon";
import { DotsMenu, type Data as AgentsData } from "./agents-panel";

type Wallets = Awaited<ReturnType<typeof getWallets>>;
type Mirrors = Awaited<ReturnType<typeof mirrorView>> & { canManage: boolean };
type Mirror = Mirrors["mirrors"][number];

const HOLDING = ["abriendo", "abierta", "vendiendo"];

const when = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

export function RealMoneyPanel() {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [mirrors, setMirrors] = useState<Mirrors | null>(null);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ agent: string; name: string; budget: number | null; toReal?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, m, a] = await Promise.all([api<Wallets>("wallets"), api<Mirrors>("mirror"), api<AgentsData>("agents")]);
      setWallets(w);
      setMirrors(m);
      setAgents(a);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const stop = async (m: Mirror) => {
    if (!window.confirm(`¿Quitarle el dinero a ${m.name}? Si tiene algo comprado, se vende ahora a mercado en tu exchange.`)) return;
    setBusy(m.agent);
    try {
      await api("mirror/stop", { agent: m.agent });
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!wallets || !mirrors) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard height="h-64" />;

  const active = mirrors.mirrors.filter((m) => m.active);
  const colorOf = (key: string) => agents?.agents.find((a) => a.key === key)?.color ?? "slate";
  const assigned = active.reduce((s, m) => s + m.budget, 0);
  const result = active.reduce((s, m) => s + m.result, 0);
  const legs = mirrors.mirrors
    .flatMap((m) => m.legs.map((l) => ({ ...l, agentName: m.name, agent: m.agent })))
    .filter((l) => l.mode === "real" || l.status !== "omitida")
    .sort((a, b) => (b.closedAt ?? b.openedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.openedAt ?? a.createdAt))
    .slice(0, 12);

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Exchanges */}
      {wallets.items.length === 0 ? (
        <section className={`${card} px-6 py-6`}>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Link2 className="h-5 w-5 text-blue-600" /> Conecta tu exchange
          </h2>
          <p className="mt-1 text-sm text-slate-600">Para que tus agentes operen con dinero real, conecta tu cuenta (por ejemplo, Bitvavo) con una clave sin permiso de retirar.</p>
          <Link href="/trading/integraciones" className={`${primary} mt-3`}>
            Ir a Integraciones
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wallets.items.map((w) => (
            <Link key={w.id} href="/trading/integraciones" className={`${card} flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-md ${w.operating ? "" : "opacity-70"}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- logotipos externos pequeños */}
                {w.logo ? <img src={w.logo} alt="" className={`h-6 w-6 object-contain ${w.operating ? "" : "grayscale"}`} /> : <Wallet className="h-5 w-5 text-slate-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {w.name}
                  {w.operating ? <Pill color="emerald">Opera</Pill> : <Pill>Solo consulta</Pill>}
                </span>
                <span className="mt-0.5 block text-2xl font-bold tracking-tight tabular-nums text-slate-900">
                  {w.total === null ? "—" : w.currency === "EUR" ? eur(w.total, 2) : `${w.total.toFixed(2)} ${w.currency}`}
                </span>
                <span className="block text-xs text-slate-500">
                  {w.error ? "No se pudo leer el saldo" : w.cash !== null ? `${eur(w.cash, 2)} libres${w.operating && assigned ? ` · ${eur(assigned, 2)} asignados a agentes` : ""}` : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {mirrors.real.problem && wallets.items.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {mirrors.real.problem}.{" "}
          <Link href="/trading/integraciones" className="font-semibold underline">
            Revisar
          </Link>
        </p>
      )}

      {/* Agentes con tu dinero */}
      <section className={card}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Agentes con tu dinero</h2>
            <p className="text-xs text-slate-500">
              {active.length ? (
                <>
                  {eur(assigned, 2)} asignados ·{" "}
                  <span className={`font-semibold ${tone(result)}`}>
                    {result >= 0 ? "+" : ""}
                    {eur(result, 2)}
                  </span>{" "}
                  en operaciones cerradas
                </>
              ) : (
                "Ningún agente mueve todavía tu dinero real."
              )}
            </p>
          </div>
          {mirrors.canManage && (
            <button type="button" className={primary} onClick={() => setEditing({ agent: "", name: "", budget: null })} disabled={!wallets.items.length}>
              <Plus className="h-4 w-4" /> Dar dinero a un agente
            </button>
          )}
        </header>
        {active.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Elige un agente que te convenza en <Link href="/trading/agentes" className="font-medium text-blue-700 hover:underline">Agentes</Link> y dale una cantidad: hará con ella lo mismo que con su dinero virtual.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-left">Agente</th>
                  <th className="px-3 py-2.5 text-right">Le das</th>
                  <th className="px-3 py-2.5 text-left">Ahora tiene</th>
                  <th className="px-3 py-2.5 text-right">Resultado</th>
                  <th className="px-3 py-2.5 text-left">Desde</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {active.map((m) => {
                  const open = m.legs.filter((l) => HOLDING.includes(l.status));
                  const test = m.mode !== "real";
                  return (
                    <tr key={m.agent} className="border-t border-slate-100 align-middle">
                      <td className="px-5 py-3">
                        <Link href={`/trading/agentes/${m.agent}`} className="flex items-center gap-3 hover:underline">
                          <AgentAvatar color={colorOf(m.agent)} />
                          <span>
                            <b className="block font-semibold text-slate-900">{m.name}</b>
                            {test && <span className="text-[11px] font-medium text-amber-700">Sin enviar órdenes (prueba)</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{eur(m.budget, 2)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {open.length === 0 ? (
                          <span className="text-slate-500">Efectivo</span>
                        ) : (
                          open.map((l) => (
                            <span key={l.id} className="flex items-center gap-1.5">
                              <AssetIcon symbol={l.symbol} name={l.symbol} size="xs" />
                              {l.symbol.replace(/-EUR$/, "")} · {eur(l.amount, 2)}
                            </span>
                          ))
                        )}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${tone(m.result)}`}>
                        {m.result >= 0 ? "+" : ""}
                        {eur(m.result, 2)}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{dayFmt(m.startedAt)}</td>
                      <td className="px-3 py-3 text-right">
                        {busy === m.agent ? (
                          <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          mirrors.canManage && (
                            <DotsMenu
                              label={`Acciones de ${m.name}`}
                              items={[
                                { label: "Cambiar importe", icon: Pencil, onClick: () => setEditing({ agent: m.agent, name: m.name, budget: m.budget }) },
                                ...(test
                                  ? [{ label: "Pasar a dinero real", icon: ArrowRightLeft, onClick: () => setEditing({ agent: m.agent, name: m.name, budget: m.budget, toReal: true }) }]
                                  : []),
                                { label: "Pausar", icon: Pause, soon: true },
                                { label: "Quitarle el dinero", icon: Trash2, danger: true, onClick: () => void stop(m) },
                              ]}
                            />
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lo que han hecho con tu dinero */}
      {legs.length > 0 && (
        <section className={card}>
          <h2 className="border-b border-slate-100 px-5 py-4 text-base font-semibold text-slate-900">Lo último que han hecho con tu dinero</h2>
          <ul className="divide-y divide-slate-100">
            {legs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <AssetIcon symbol={l.symbol} name={l.symbol} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">
                      <b className="font-semibold">{l.agentName}</b>{" "}
                      {l.status === "cerrada"
                        ? `vendió ${l.symbol.replace(/-EUR$/, "")}`
                        : l.status === "omitida"
                          ? `no pudo copiar ${l.symbol.replace(/-EUR$/, "")}`
                          : l.status === "error"
                            ? `error con ${l.symbol.replace(/-EUR$/, "")}`
                            : `compró ${l.symbol.replace(/-EUR$/, "")}${l.amount ? ` por ${eur(l.amount, 2)}` : ""}`}
                      {l.mode !== "real" && <span className="ml-1 text-xs text-amber-700">(prueba)</span>}
                    </span>
                    {l.note && (l.status === "omitida" || l.status === "error") && <span className="block truncate text-xs text-slate-500">{l.note}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {l.result !== null && (
                    <span className={`block font-semibold tabular-nums ${tone(l.result)}`}>
                      {l.result >= 0 ? "+" : ""}
                      {eur(l.result, 2)}
                    </span>
                  )}
                  <span className="block text-xs text-slate-400">{when(l.closedAt ?? l.openedAt ?? l.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && <BudgetModal state={editing} agents={agents} maxBudget={mirrors.maxBudget} taken={active.map((m) => m.agent)} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Dar dinero a un agente, cambiar cuánto o pasar una prueba a dinero real. */
function BudgetModal({
  state,
  agents,
  maxBudget,
  taken,
  onClose,
}: {
  state: { agent: string; name: string; budget: number | null; toReal?: boolean };
  agents: AgentsData | null;
  maxBudget: number;
  taken: string[];
  onClose: () => void;
}) {
  const isNew = !state.agent;
  const [agent, setAgent] = useState(state.agent);
  const [budget, setBudget] = useState(String(state.budget ?? 20));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(budget.replace(",", "."));
  const valid = !!agent && value >= 5 && value <= maxBudget;
  // Solo los agentes que operan crypto se pueden copiar en un exchange de crypto.
  const options = (agents?.agents ?? []).filter((a) => !taken.includes(a.key));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("mirror/set", { agent, budget: value, mode: "real" });
      refreshTrading();
      onClose();
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
      title={isNew ? "Dar dinero a un agente" : state.toReal ? `Pasar ${state.name} a dinero real` : `Cambiar el importe de ${state.name}`}
      subtitle="Hará con tu dinero lo mismo que con su dinero virtual, en proporción."
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} disabled={!valid || saving} onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {isNew && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Agente</span>
            <select className={`${field} mt-1 w-full`} value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">Elige un agente…</option>
              {options.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} · {a.profile}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Cuánto le das (entre 5 € y {eur(maxBudget, 0)})</span>
          <div className="mt-1 flex items-center gap-2">
            <input className={`${field} w-32 text-right tabular-nums`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <span>€</span>
          </div>
        </label>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>Solo se copian sus compras de crypto que tu exchange tenga en euros.</li>
          <li>Copia lo que compre a partir de ahora; lo que ya tiene no se compra.</li>
          <li>Si cambias el importe, se aplica a sus próximas compras.</li>
        </ul>
        {error && <p className="text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
