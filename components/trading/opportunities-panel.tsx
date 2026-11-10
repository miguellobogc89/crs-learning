"use client";
// Oportunidades: lo que han comprado (o vendido) los agentes, agrupado por valor y con el tamaño
// calculado para tu cartera. Tú decides qué ejecutar.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Info, Loader2 } from "lucide-react";
import type { getOpportunities } from "@/lib/trading/agents/opportunities";
import { api, errorText, eur, eur0, ghost, int, panel, pct, primary } from "./format";
import { AGENT_DOT, ago } from "./home-panel";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { ConfirmOrderModal, EvidenceList, TradeInfoModal, type TradeIdea } from "./trade-modals";
import { OpenAccount } from "./open-account";
import { Rich } from "./ui";

type Data = Awaited<ReturnType<typeof getOpportunities>>;
type Buy = Data["buys"][number];

const STATUS: Record<Buy["status"], string> = {
  ok: "",
  tienes: "Ya lo tienes en tu cartera",
  stop_superado: "El precio ya ha caído por debajo del stop: ya no vale",
  objetivo_alcanzado: "El precio ya llegó al objetivo: llegas tarde",
};

const unit = (b: Pick<Buy, "market" | "symbol">) => (b.market === "crypto" ? b.symbol.replace(/-EUR$/, "") : "acciones");

const names = (list: string[]) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}`);

function ideaOf(b: Buy): TradeIdea {
  const lead = b.agents.find((a) => a.agent === b.lead) ?? b.agents[0];
  return {
    key: `agentes:${b.symbol}:${lead.at.slice(0, 10)}`,
    source: "agente",
    symbol: b.symbol,
    name: b.name,
    market: b.market,
    action: "comprar",
    direction: "long",
    price: b.price,
    stop: b.stop,
    target: b.target,
    quantity: b.quantity,
    rationale: `${lead.name}: ${lead.rationale}`,
    pros: [],
    cons: lead.risks ? [lead.risks] : [],
    evidence: lead.evidence,
    origin: b.agents.length > 1 ? `${b.agents.length} agentes coinciden` : lead.name,
    conviction: lead.conviction,
    horizonDays: Math.round(lead.horizonDays * 1.5),
    signalKey: `agentes:${b.symbol}:${lead.at.slice(0, 10)}`,
  };
}

export function OpportunitiesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<TradeIdea | null>(null);
  const [confirm, setConfirm] = useState<TradeIdea | null>(null);
  const [selling, setSelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("opportunities"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const sell = async (positionId: string, name: string, pending: boolean) => {
    if (!window.confirm(pending ? `¿Cancelar tu orden de compra de ${name}?` : `¿Vender tu posición en ${name} al último precio?`)) return;
    setSelling(positionId);
    try {
      await api("close", { positionId });
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSelling(null);
    }
  };

  if (!data)
    return error ? (
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    ) : (
      <div className="flex h-48 items-center justify-center border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );

  const active = data.buys.filter((b) => b.status === "ok");
  const rest = data.buys.filter((b) => b.status !== "ok");
  const met = data.lastRuns.filter((r) => r.at);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Lo que han comprado los agentes en su última reunión
        {met.length ? ` (${met.map((r) => `${r.name} ${ago(r.at!)}`).join(" · ")})` : ""}. La cantidad está calculada para{" "}
        <b>tu cartera</b>: arriesgas como mucho el {pct(data.account.riskPct, 1, false)} de tu patrimonio en cada operación.
      </p>
      {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data.account.opened && <OpenAccount compact />}

      {data.sells.length > 0 && (
        <section className="border border-amber-200 bg-amber-50/60">
          <h2 className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Los agentes venden algo que tú tienes
          </h2>
          <ul className="divide-y divide-amber-100">
            {data.sells.map((s) => (
              <li key={s.symbol} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 max-w-3xl text-sm">
                  <b className="font-semibold text-slate-900">{s.name}</b>
                  <span className="text-slate-600"> · lo vende {names(s.agents.map((a) => a.name))}</span>
                  <p className="mt-1 text-slate-600">
                    <Rich text={s.agents[0].rationale} />
                  </p>
                </div>
                <button
                  type="button"
                  className={ghost}
                  disabled={selling === s.positionId}
                  onClick={() => void sell(s.positionId, s.name, s.positionStatus === "pendiente")}
                >
                  {selling === s.positionId && <Loader2 className="h-4 w-4 animate-spin" />}
                  {s.positionStatus === "pendiente" ? "Cancelar mi orden" : "Vender la mía"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={panel}>
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          {active.length ? `${active.length} ${active.length === 1 ? "oportunidad" : "oportunidades"} para ti` : "Oportunidades"}
        </h2>
        {active.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            Ahora mismo no hay compras nuevas de los agentes que puedas hacer. Se reúnen cada día laborable a las 19:15.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {active.map((b) => (
              <BuyRow key={b.symbol} b={b} onInfo={() => setInfo(ideaOf(b))} onExecute={data.account.opened ? () => setConfirm(ideaOf(b)) : undefined} />
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section className={panel}>
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Otras compras de los agentes</h2>
          <ul className="divide-y divide-slate-100">
            {rest.map((b) => (
              <BuyRow key={b.symbol} b={b} onInfo={() => setInfo(ideaOf(b))} />
            ))}
          </ul>
        </section>
      )}

      {info && (
        <TradeInfoModal
          idea={info}
          onClose={() => setInfo(null)}
          onExecute={
            data.buys.find((b) => b.symbol === info.symbol)?.status === "ok"
              ? () => {
                  setConfirm(info);
                  setInfo(null);
                }
              : undefined
          }
        />
      )}
      {confirm && <ConfirmOrderModal idea={confirm} cash={data.account.cash} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function BuyRow({ b, onInfo, onExecute }: { b: Buy; onInfo: () => void; onExecute?: () => void }) {
  const [open, setOpen] = useState(false);
  const q = b.quantity ?? 0;
  const loss = b.stop !== null && q ? (b.price - b.stop) * q : null;
  const gain = b.target !== null && q ? (b.target - b.price) * q : null;
  const lead = b.agents.find((a) => a.agent === b.lead) ?? b.agents[0];
  const moved = lead.price ? ((b.price - lead.price) / lead.price) * 100 : 0;
  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-base font-semibold text-slate-900">{b.name}</b>
            <span className="text-xs text-slate-500">{b.market === "crypto" ? "Crypto" : "Bolsa"}</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              {b.agents.map((a) => (
                <span key={a.agent} className="inline-flex items-center gap-1">
                  <span className={`h-2 w-2 ${AGENT_DOT[a.color]}`} />
                  {a.name}
                </span>
              ))}
              <span className="text-slate-400">· {b.agents.length > 1 ? "lo compran" : "lo compra"}</span>
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
            <Rich text={lead.rationale} />
          </p>
          {b.status === "ok" ? (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
              <span className="text-slate-800">
                <b className="font-semibold">
                  Compra {int(q)} {unit(b)}
                </b>{" "}
                por unos {eur0(q * b.price)}
              </span>
              <span className="text-red-700">
                stop {eur(b.stop)} · si sale mal −{eur0(loss)}
              </span>
              <span className="text-emerald-700">
                objetivo {eur(b.target)} · si sale bien +{eur0(gain)}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm font-medium text-amber-700">{STATUS[b.status]}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {lead.name} lo decidió a {eur(lead.price)}; ahora está a {eur(b.price)} ({pct(moved)}).
          </p>
          <button type="button" onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {b.agents.length > 1 ? "Qué dice cada agente" : "Pruebas que usó"}
          </button>
          {open && (
            <div className="mt-2 space-y-3 border-l-2 border-slate-200 pl-3">
              {b.agents.map((a) => (
                <div key={a.agent} className="text-sm">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <span className={`h-2 w-2 ${AGENT_DOT[a.color]}`} /> {a.name} · convicción {a.conviction}/5 · stop {eur(a.stop)} · objetivo {eur(a.target)}
                  </div>
                  {b.agents.length > 1 && (
                    <p className="mt-1 text-slate-600">
                      <Rich text={a.rationale} />
                    </p>
                  )}
                  {a.risks && <p className="mt-1 text-xs text-slate-500">Riesgo: {a.risks}</p>}
                  <div className="mt-1.5">
                    <EvidenceList items={a.evidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={ghost} onClick={onInfo}>
            <Info className="h-4 w-4" /> Más info
          </button>
          {onExecute && (
            <button type="button" className={primary} onClick={onExecute} disabled={!q}>
              Ejecutar
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
