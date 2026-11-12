"use client";
// Mi cartera: tu dinero real. Arriba, su evolución y el resumen; debajo, tus agentes (como mucho 3)
// y, al elegir uno, su detalle para darle o quitarle capital y cerrar sus posiciones.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, Link2, Loader2, Plus, Trash2, Wallet, XCircle } from "lucide-react";
import type { getWallets, myAgents } from "@/lib/trading/wallets";
import type { mirrorView } from "@/lib/trading/mirror/service";
import { api, errorText, eur, field, ghost, pct, primary, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { AgentAvatar, cap, card, ErrorNote, LoadingCard, Pill, ReturnPill } from "./ui";
import { AssetIcon } from "./asset-icon";
import { EquityChart } from "./equity-chart";
import { ChipMode, type Agent, type Data as AgentsData } from "./agents-panel";

type Wallets = Awaited<ReturnType<typeof getWallets>>;
type Mine = Awaited<ReturnType<typeof myAgents>>;
type Mirrors = Awaited<ReturnType<typeof mirrorView>> & { canManage: boolean };
type Mirror = Mirrors["mirrors"][number];

const HOLDING = ["abriendo", "abierta", "vendiendo"];
const when = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
const coin = (s: string) => s.replace(/-EUR$/, "");

export function CarteraPanel() {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [mirrors, setMirrors] = useState<Mirrors | null>(null);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, m, a, o] = await Promise.all([api<Wallets>("wallets"), api<Mirrors>("mirror"), api<AgentsData>("agents"), api<Mine>("mine")]);
      setWallets(w);
      setMirrors(m);
      setAgents(a);
      setMine(o);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const rows = useMemo(() => {
    if (!agents || !mirrors || !mine) return [];
    const mirrorOf = (k: string) => mirrors.mirrors.find((m) => m.agent === k && m.active) ?? null;
    const ownRows = mine.owned.map((k) => ({ agent: agents.agents.find((a) => a.key === k) ?? null, key: k, mirror: mirrorOf(k), mine: true }));
    // Copias de agentes que no son tuyos (de antes): se ven aparte para poder quitarlas.
    const others = mirrors.mirrors
      .filter((m) => m.active && !mine.owned.includes(m.agent))
      .map((m) => ({ agent: agents.agents.find((a) => a.key === m.agent) ?? null, key: m.agent, mirror: m, mine: false }));
    return [...ownRows, ...others];
  }, [agents, mirrors, mine]);

  if (!wallets || !mirrors || !agents || !mine) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard height="h-96" />;

  const real = wallets.items.filter((w) => w.environment === "real" && w.total !== null);
  const total = real.reduce((s, w) => s + (w.currency === "EUR" ? w.total ?? 0 : 0), 0);
  const free = real.reduce((s, w) => s + (w.currency === "EUR" ? w.cash ?? 0 : 0), 0);
  const realMirrors = mirrors.mirrors.filter((m) => m.active && m.mode === "real");
  const assigned = realMirrors.reduce((s, m) => s + m.budget, 0);
  const copies = wallets.items.find((w) => w.operating)?.copies ?? null;
  const current = rows.find((r) => r.key === selected) ?? rows[0] ?? null;
  const ownCount = mine.owned.length;

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Cabecera: evolución + resumen */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="px-2 pt-2">
            <EquityChart
              points={mine.history}
              initial={mine.history[0]?.equity ?? total}
              height={210}
              empty="Tu gráfica empieza hoy: cada día se guarda el saldo de tus exchanges."
            />
          </div>
        </section>
        <section className={`${card} flex flex-col px-6 py-5`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tu dinero real</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur(total, 2)}</div>
          {copies && copies.pct !== null && (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <ReturnPill value={copies.pct} /> con tus agentes ({copies.result >= 0 ? "+" : ""}
              {eur(copies.result, 2)})
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Libre</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{eur(free, 2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Asignado a agentes</dt>
              <dd className={`font-semibold tabular-nums ${assigned > total + 0.01 ? "text-amber-700" : "text-slate-900"}`}>{eur(assigned, 2)}</dd>
            </div>
          </dl>
          {assigned > total + 0.01 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Asignas más de lo que tienes: si dos agentes compran a la vez, el segundo usará solo lo que quede libre.
            </p>
          )}
          <div className="mt-auto space-y-1.5 border-t border-slate-100 pt-3">
            {wallets.items.length === 0 ? (
              <Link href="/trading/integraciones" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
                <Link2 className="h-4 w-4" /> Conecta tu exchange
              </Link>
            ) : (
              wallets.items.map((w) => (
                <Link key={w.id} href="/trading/integraciones" className={`flex items-center justify-between gap-2 text-xs hover:text-slate-900 ${w.operating ? "text-slate-700" : "text-slate-400"}`}>
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- logotipos externos pequeños */}
                    {w.logo ? <img src={w.logo} alt="" className={`h-4 w-4 ${w.operating ? "" : "grayscale"}`} /> : <Wallet className="h-4 w-4" />}
                    {w.name}
                    {!w.operating && " · solo consulta"}
                  </span>
                  <span className="tabular-nums">{w.total === null ? "—" : eur(w.total, 2)}</span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {mirrors.real.problem && wallets.items.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {mirrors.real.problem}.{" "}
          <Link href="/trading/integraciones" className="font-semibold underline">
            Revisar
          </Link>
        </p>
      )}

      {/* Tus agentes + detalle */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${card} lg:col-span-2`}>
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Tus agentes</h2>
              <p className="text-xs text-slate-500">
                {ownCount} de {mine.max} · solo tus agentes mueven tu dinero real
              </p>
            </div>
          </header>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <AgentRow key={r.key} r={r} active={current?.key === r.key} onClick={() => setSelected(r.key)} />
            ))}
            {Array.from({ length: Math.max(0, mine.max - ownCount) }).map((_, i) => (
              <li key={`hueco-${i}`} className="flex items-center gap-4 px-5 py-4 text-slate-400">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-slate-200">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm">
                  <b className="font-semibold text-slate-500">Crear agente</b> · te queda {mine.max - ownCount === 1 ? "1 hueco" : `${mine.max - ownCount} huecos`}
                </span>
                <Pill>Pronto</Pill>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${card} lg:sticky lg:top-0 lg:self-start`}>
          {current ? (
            <AgentDetail key={current.key} r={current} canManage={mirrors.canManage} maxBudget={mirrors.maxBudget} free={free} />
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Elige un agente para ver su detalle.</p>
          )}
        </section>
      </div>
    </div>
  );
}

type Row = { agent: Agent | null; key: string; mirror: Mirror | null; mine: boolean };

function AgentRow({ r, active, onClick }: { r: Row; active: boolean; onClick: () => void }) {
  const a = r.agent;
  const m = r.mirror;
  const open = m?.legs.filter((l) => HOLDING.includes(l.status)) ?? [];
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors ${active ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
        <AgentAvatar color={a?.color ?? "slate"} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b className="font-semibold text-slate-900">{a?.name ?? m?.name ?? r.key}</b>
            {a && <Pill color={a.color}>{cap(a.profile)}</Pill>}
            {a && <ChipMode a={a} />}
            {!r.mine && <Pill>No es tuyo</Pill>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {!m
              ? "Sin dinero real: solo opera con su dinero virtual"
              : m.mode !== "real"
                ? `Sin enviar órdenes (prueba) · ${eur(m.budget, 2)}`
                : open.length
                  ? `Tiene ${open.map((l) => `${coin(l.symbol)} (${eur(l.amount, 2)})`).join(", ")}`
                  : "En efectivo"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums text-slate-900">{m ? eur(m.budget, 2) : "—"}</span>
          {m ? (
            <span className={`block text-xs font-semibold tabular-nums ${tone(m.result)}`}>
              {m.result >= 0 ? "+" : ""}
              {eur(m.result, 2)}
            </span>
          ) : (
            a && <span className={`block text-xs tabular-nums ${tone(a.summary.returnPct)}`}>{pct(a.summary.returnPct)} virtual</span>
          )}
        </span>
      </button>
    </li>
  );
}

function AgentDetail({ r, canManage, maxBudget, free }: { r: Row; canManage: boolean; maxBudget: number; free: number }) {
  const a = r.agent;
  const m = r.mirror;
  const [budget, setBudget] = useState(String(m?.budget ?? 20));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const value = Number(budget.replace(",", "."));
  const valid = value >= 5 && value <= maxBudget;
  const open = m?.legs.filter((l) => HOLDING.includes(l.status)) ?? [];
  const legs = (m?.legs ?? []).filter((l) => l.status !== "omitida" || l.mode === "real").slice(0, 8);

  const run = async (what: string, path: string, body: unknown, ok: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(what);
    setError(null);
    setDone(null);
    try {
      await api(path, body);
      setDone(ok);
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <AgentAvatar color={a?.color ?? "slate"} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-base font-semibold text-slate-900">{a?.name ?? r.key}</b>
            {a && <ChipMode a={a} />}
          </div>
          {a && (
            <p className="mt-0.5 text-xs text-slate-500">
              Con su dinero virtual: <span className={`font-semibold ${tone(a.summary.returnPct)}`}>{pct(a.summary.returnPct)}</span>
            </p>
          )}
        </div>
        <Link href={`/trading/agentes/${r.key}?from=cartera`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
          Ver <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="space-y-4 px-5 py-4 text-sm">
        {/* Capital */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
            <span>{m ? "Le das" : "Darle dinero real"}</span>
            {m && m.mode !== "real" && <span className="text-amber-700">Ahora sin enviar órdenes</span>}
          </div>
          <div className="flex items-center gap-2">
            <input className={`${field} w-28 text-right tabular-nums`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={!canManage} />
            <span className="text-slate-500">€</span>
            <button
              type="button"
              className={primary}
              disabled={!canManage || !valid || !!busy || (m?.mode === "real" && value === m.budget)}
              onClick={() => void run("capital", "mirror/set", { agent: r.key, budget: value, mode: "real" }, m ? "Importe actualizado." : "Ya mueve tu dinero real.")}
            >
              {busy === "capital" && <Loader2 className="h-4 w-4 animate-spin" />}
              {!m ? "Darle" : m.mode !== "real" ? (
                <>
                  <ArrowRightLeft className="h-4 w-4" /> Pasar a real
                </>
              ) : (
                "Guardar"
              )}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Entre 5 € y {eur(maxBudget, 0)} · tienes {eur(free, 2)} libres. Se aplica a sus próximas compras.
          </p>
        </div>

        {/* Lo que tiene */}
        {m && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Ahora tiene con tu dinero</span>
              {open.length > 0 && canManage && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
                      "cerrar",
                      "mirror/close",
                      { agent: r.key },
                      "Posiciones cerradas. Seguirá copiando sus próximas compras.",
                      `¿Vender ahora lo que tiene ${a?.name ?? r.key} con tu dinero? Seguirá copiando sus próximas compras.`,
                    )
                  }
                >
                  {busy === "cerrar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Cerrar posiciones
                </button>
              )}
            </div>
            {open.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Nada: en efectivo.</p>
            ) : (
              <ul className="space-y-1.5">
                {open.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <AssetIcon symbol={l.symbol} name={l.symbol} size="xs" /> {coin(l.symbol)}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      {eur(l.amount, 2)} a {eur(l.entryPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Movimientos */}
        {legs.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-600">Lo último con tu dinero</div>
            <ul className="divide-y divide-slate-100 text-xs">
              {legs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-slate-700">
                    {l.status === "cerrada" ? "Vendió" : l.status === "omitida" ? "No copió" : l.status === "error" ? "Error con" : "Compró"} {coin(l.symbol)}
                    {l.mode !== "real" && <span className="text-amber-700"> (prueba)</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    {l.result !== null && (
                      <span className={`mr-2 font-semibold tabular-nums ${tone(l.result)}`}>
                        {l.result >= 0 ? "+" : ""}
                        {eur(l.result, 2)}
                      </span>
                    )}
                    <span className="text-slate-400">{when(l.closedAt ?? l.openedAt ?? l.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">{done}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        {m && canManage && (
          <button
            type="button"
            className={`${ghost} w-full justify-center text-red-700`}
            disabled={!!busy}
            onClick={() =>
              void run(
                "quitar",
                "mirror/stop",
                { agent: r.key },
                "Le has quitado el dinero. Sigue operando solo con su dinero virtual.",
                `¿Quitarle el dinero a ${a?.name ?? r.key}? Si tiene algo comprado, se vende ahora.`,
              )
            }
          >
            {busy === "quitar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Quitarle el dinero
          </button>
        )}
      </div>
    </div>
  );
}
