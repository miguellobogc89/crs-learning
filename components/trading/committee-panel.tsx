"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Info, Loader2, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import type { getCommittee } from "@/lib/trading/committee/service";
import { api, dayFmt, errorText, eur, eur0, ghost, num, panel, pct, primary, th, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { ConfirmOrderModal, TradeInfoModal, type TradeIdea } from "./trade-modals";
import { Rich } from "./ui";

export type Committee = Awaited<ReturnType<typeof getCommittee>> & { canManage: boolean };
export type Proposal = NonNullable<Committee["latest"]>["proposals"][number];

const ACTION = {
  comprar: { label: "Comprar", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  vender: { label: "Vender", tone: "bg-red-50 text-red-700 border-red-200" },
  mantener: { label: "Mantener", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  vigilar: { label: "Vigilar", tone: "bg-slate-50 text-slate-700 border-slate-200" },
} as const;

const OUTCOME: Record<string, string> = {
  pendiente: "Sin ejecutar aún",
  "en curso": "En curso",
  objetivo: "Objetivo alcanzado",
  stop: "Saltó el stop",
  tiempo: "Cerrada por tiempo",
};

const qtyFmt = (q: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: q < 1 ? 6 : q < 100 ? 4 : 0 }).format(q);
const unitOf = (p: Proposal) => (p.market === "crypto" ? p.symbol.replace(/-EUR$/, "") : "acciones");

function Conviction({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Convicción ${value} de 5`} aria-label={`Convicción ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <i key={k} className={`inline-block h-2 w-2 ${k <= value ? "bg-slate-800" : "bg-slate-200"}`} />
      ))}
    </span>
  );
}

export function ideaFromProposal(p: Proposal): TradeIdea {
  return {
    key: p.id,
    source: "comite",
    symbol: p.symbol,
    name: p.name,
    market: p.market,
    action: p.action,
    direction: "long",
    price: p.price,
    stop: p.stop,
    target: p.target,
    quantity: p.quantity,
    rationale: p.rationale,
    pros: [],
    cons: p.risks ? [p.risks] : [],
    evidence: p.evidence,
    origin: "Comité de inversión",
    conviction: p.conviction,
    horizonDays: p.horizonDays,
    proposalId: p.id,
  };
}

export function ProposalCard({
  p,
  onInfo,
  onExecute,
  onDismiss,
  busy,
  compact = false,
}: {
  p: Proposal;
  onInfo: () => void;
  onExecute: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const buy = p.action === "comprar";
  const loss = buy && p.quantity && p.stop ? p.quantity * (p.price - p.stop) : null;
  const gain = buy && p.quantity && p.target ? p.quantity * (p.target - p.price) : null;
  const canExecute = p.status === "propuesta" && (buy || p.action === "vender" || (p.action === "mantener" && p.stop !== null));
  return (
    <article className={`${panel} flex flex-col`}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{p.name}</div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {p.market === "crypto" ? "Crypto" : "Bolsa"} · <Conviction value={p.conviction} />
          </div>
        </div>
        <span className={`shrink-0 border px-2 py-0.5 text-xs font-semibold ${ACTION[p.action].tone}`}>{ACTION[p.action].label}</span>
      </header>

      {buy && p.quantity !== null && (
        <>
          <p className="px-4 pt-3 text-[15px] text-slate-900">
            <Rich text={`**Compra ${qtyFmt(p.quantity)} ${unitOf(p)}**`} />{" "}
            <span className="text-slate-500">por unos {eur0(p.quantity * p.price)}</span>
          </p>
          <dl className="mx-4 mt-3 grid grid-cols-3 gap-px border border-slate-200 bg-slate-200 text-center">
            <div className="bg-white px-2 py-2">
              <dt className="text-[11px] text-slate-500">Precio</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{eur(p.price)}</dd>
            </div>
            <div className="bg-white px-2 py-2">
              <dt className="text-[11px] text-red-700">Si sale mal</dt>
              <dd className="font-semibold tabular-nums text-red-700">{loss !== null ? `−${eur0(loss)}` : "—"}</dd>
            </div>
            <div className="bg-white px-2 py-2">
              <dt className="text-[11px] text-emerald-700">Si sale bien</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">{gain !== null ? `+${eur0(gain)}` : "—"}</dd>
            </div>
          </dl>
        </>
      )}

      <div className="flex-1 px-4 py-3">
        <p className={`text-sm leading-relaxed text-slate-700 ${compact ? "line-clamp-3" : "line-clamp-4"}`}>
          <Rich text={p.rationale} />
        </p>
        {!compact && p.risks && (
          <p className="mt-2 flex gap-1.5 text-xs text-amber-800">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" /> <span className="line-clamp-2">{p.risks}</span>
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        {p.status === "propuesta" && onDismiss ? (
          <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={onDismiss} disabled={busy}>
            Descartar
          </button>
        ) : (
          <span className="text-xs font-medium text-slate-500">{p.status === "ejecutada" ? "Hecho en tu cartera" : p.status === "descartada" ? "Descartada" : ""}</span>
        )}
        <div className="flex gap-2">
          <button type="button" className={ghost} onClick={onInfo}>
            <Info className="h-4 w-4" /> Más info
          </button>
          {canExecute && (
            <button type="button" className={primary} onClick={onExecute} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {p.action === "mantener" ? "Subir stop" : p.action === "vender" ? "Vender" : "Ejecutar orden"}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

/** Bloque principal de «Oportunidades»: la reunión del comité. */
export function CommitteeToday() {
  const [data, setData] = useState<Committee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [info, setInfo] = useState<Proposal | null>(null);
  const [confirm, setConfirm] = useState<Proposal | null>(null);
  const auto = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Committee>("committee"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await api("committee/run", {});
      await load();
    } catch (e) {
      setError(errorText(e));
      await load();
    } finally {
      setRunning(false);
    }
  }, [load]);

  // Una reunión al día: si no la hay, se convoca sola al entrar.
  useEffect(() => {
    if (data && data.stale && data.canManage && !auto.current) {
      auto.current = true;
      void run();
    }
  }, [data, run]);

  const dismiss = async (p: Proposal) => {
    setBusy(p.id);
    setError(null);
    try {
      await api("committee/decide", { proposalId: p.id, decision: "descartar" });
      await load();
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const latest = data?.latest;
  const active = latest?.proposals.filter((p) => p.status !== "rechazada" && p.action !== "vigilar") ?? [];
  const watching = latest?.proposals.filter((p) => p.status !== "rechazada" && p.action === "vigilar") ?? [];
  const rejected = latest?.proposals.filter((p) => p.status === "rechazada") ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">Comité de inversión</h2>
          {latest && (
            <span className="text-xs text-slate-500">
              reunido el {dayFmt(latest.createdAt)} a las{" "}
              {new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(latest.createdAt))}
            </span>
          )}
        </div>
        {data?.canManage && (
          <button type="button" className={ghost} onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {running ? "Analizando…" : "Volver a convocar"}
          </button>
        )}
      </div>

      {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {running && (
        <div className={`${panel} flex items-center gap-3 px-4 py-4 text-sm text-slate-600`}>
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          El comité está revisando figuras, noticias, tendencia y tu cartera. Tarda entre 20 y 60 segundos.
        </div>
      )}

      {!data && !error ? (
        <div className="flex h-32 items-center justify-center border border-slate-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : !latest ? (
        !running && (
          <div className={`${panel} px-4 py-5 text-sm text-slate-600`}>
            El comité aún no se ha reunido.{" "}
            {data?.canManage ? "Pulsa «Volver a convocar»." : "Pide a un administrador del espacio que lo convoque."}
          </div>
        )
      ) : (
        <>
          {info && (
            <TradeInfoModal
              idea={ideaFromProposal(info)}
              onClose={() => setInfo(null)}
              onExecute={
                info.status === "propuesta"
                  ? () => {
                      setConfirm(info);
                      setInfo(null);
                    }
                  : undefined
              }
            />
          )}
          {confirm && <ConfirmOrderModal idea={ideaFromProposal(confirm)} broker={data.broker} onClose={() => setConfirm(null)} />}
          {latest.status === "error" ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">La última reunión falló: {latest.error}</p>
          ) : (
            latest.marketView && (
              <div className={`${panel} border-l-4 border-l-blue-500 px-4 py-3 text-sm leading-relaxed text-slate-700`}>
                <Rich text={latest.marketView} />
              </div>
            )
          )}

          {latest.status !== "error" &&
            (active.length === 0 ? (
              <div className={`${panel} px-4 py-4 text-sm text-slate-600`}>
                Hoy el comité no ve ninguna operación clara. No operar también es una decisión.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {active.map((p) => (
                  <ProposalCard
                    key={p.id}
                    p={p}
                    busy={busy === p.id}
                    onInfo={() => setInfo(p)}
                    onExecute={() => setConfirm(p)}
                    onDismiss={() => dismiss(p)}
                  />
                ))}
              </div>
            ))}

          {(watching.length > 0 || latest.watchlist.length > 0) && (
            <div className={panel}>
              <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Para vigilar</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {watching.map((p) => (
                  <li key={p.id} className="px-4 py-2.5">
                    <b className="font-semibold text-slate-900">{p.name}</b> <span className="text-slate-600">— <Rich text={p.rationale} /></span>
                  </li>
                ))}
                {latest.watchlist
                  .filter((w) => !watching.some((p) => p.symbol === w.symbol))
                  .map((w) => (
                    <li key={w.symbol} className="px-4 py-2.5">
                      <b className="font-semibold text-slate-900">{w.name}</b> <span className="text-slate-600">— {w.reason}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {rejected.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowRejected(!showRejected)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRejected ? "rotate-180" : ""}`} />
                {rejected.length === 1 ? "1 propuesta frenada por las reglas" : `${rejected.length} propuestas frenadas por las reglas`}
              </button>
              {showRejected && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {rejected.map((p) => (
                    <li key={p.id}>
                      <b>{ACTION[p.action].label} {p.name}</b>: {p.rejection}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Página de historial: qué propuso el comité y qué tal le habría ido. */
export function CommitteeHistory() {
  const [data, setData] = useState<Committee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Committee>("committee").then(setData).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => load(), [load]);
  useTradingRefresh(load);

  if (error) return <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!data)
    return (
      <div className="flex h-40 items-center justify-center border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  const s = data.scoreboard;
  const rows = data.history.filter((h) => h.status !== "rechazada");
  return (
    <div className="space-y-4">
      <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Compras propuestas", String(s.proposals), `${s.executed} hechas en tu cartera`, "text-slate-500"],
          ["Terminadas", String(s.closed), s.closed ? `${num((s.wins / s.closed) * 100, 0)} % ganadoras` : "aún ninguna", "text-slate-500"],
          ["R medio", s.avgR === null ? "—" : num(s.avgR, 2), "por operación terminada", tone(s.avgR)],
          ["Resultado medio", pct(s.avgReturnPct), "por propuesta", tone(s.avgReturnPct)],
          ["Mercado en el mismo plazo", pct(s.avgBenchmarkPct), "IBEX o Bitcoin", tone(s.avgBenchmarkPct)],
        ].map(([label, value, sub, cls]) => (
          <div key={label} className="bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${label === "R medio" || label === "Resultado medio" ? cls : "text-slate-900"}`}>{value}</div>
            <div className="text-xs text-slate-500">{sub}</div>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Se mide cada propuesta como si la hubieras seguido: compra en la apertura siguiente y salida en el stop, el objetivo o al
        pasar su plazo. Se compara con lo que hizo el IBEX (o Bitcoin, en crypto) en las mismas fechas. Con pocas propuestas los
        números todavía no dicen mucho: hacen falta varias semanas.
      </p>
      <section className={`${panel} overflow-x-auto`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Activo</th>
              <th className={th}>Propuesta</th>
              <th className={th}>Estado</th>
              <th className={`${th} text-right`}>Desde la propuesta</th>
              <th className={`${th} text-right`}>R</th>
              <th className={`${th} text-right`}>Mercado</th>
              <th className={th}>Tú</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Todavía no hay propuestas. El comité se reúne al entrar en «Oportunidades».
                </td>
              </tr>
            ) : (
              rows.map((h) => (
                <tr key={h.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 tabular-nums text-slate-600">{dayFmt(h.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{h.name}</div>
                    <div className="text-xs text-slate-500">{h.symbol}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`border px-1.5 py-0.5 text-xs font-medium ${ACTION[h.action].tone}`}>{ACTION[h.action].label}</span>
                    <div className="mt-1 line-clamp-2 max-w-md text-xs text-slate-500" title={h.rationale}>
                      {h.rationale.replace(/\*\*/g, "")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{h.outcome ? OUTCOME[h.outcome.state] : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(h.outcome?.returnPct)}`}>{pct(h.outcome?.returnPct)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(h.outcome?.r)}`}>{h.outcome?.r !== null && h.outcome?.r !== undefined ? num(h.outcome.r, 2) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(h.outcome?.benchmarkPct)}`}>{pct(h.outcome?.benchmarkPct)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{h.status === "ejecutada" ? "La hiciste" : h.status === "descartada" ? "Descartada" : "Sin decidir"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
