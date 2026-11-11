"use client";
// Oportunidades: lo que han comprado (o vendido) los agentes, agrupado por valor y con el tamaño
// calculado para tu cartera, en una tabla ordenable. Tú decides qué ejecutar.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Loader2, Play } from "lucide-react";
import type { getOpportunities } from "@/lib/trading/agents/opportunities";
import { api, errorText, eur, eur0, ghost, int, pct, primary, MEETINGS_TEXT } from "./format";
import { ago } from "./home-panel";
import { AgentAvatar, ErrorNote, LoadingCard, Pill, Rich } from "./ui";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { ConfirmOrderModal, EvidenceList, TradeInfoModal, type TradeIdea } from "./trade-modals";
import { OpenAccount } from "./open-account";
import { AssetIcon } from "./asset-icon";

type Data = Awaited<ReturnType<typeof getOpportunities>>;
type Buy = Data["buys"][number];

const STATUS: Record<Buy["status"], { label: string; color: string; text: string }> = {
  ok: { label: "Disponible", color: "emerald", text: "Puedes ejecutarla ahora." },
  tienes: { label: "Ya la tienes", color: "slate", text: "Ya lo tienes en tu cartera." },
  stop_superado: { label: "Ya no vale", color: "orange", text: "El precio ya ha caído por debajo del stop." },
  objetivo_alcanzado: { label: "Llegas tarde", color: "orange", text: "El precio ya llegó al objetivo." },
};

type SortKey = "valor" | "agentes" | "precio" | "cambio" | "stop" | "objetivo" | "importe" | "conviccion" | "cuando" | "estado";
type Row = {
  b: Buy;
  lead: Buy["agents"][number];
  moved: number;
  risk: number | null;
  upside: number | null;
  notional: number | null;
  conviction: number;
};

const SORT: Record<SortKey, (r: Row) => number | string> = {
  valor: (r) => r.b.name.toLowerCase(),
  agentes: (r) => r.b.agents.length * 10 + r.conviction,
  precio: (r) => r.b.price,
  cambio: (r) => r.moved,
  stop: (r) => r.risk ?? Infinity,
  objetivo: (r) => r.upside ?? -Infinity,
  importe: (r) => r.notional ?? -Infinity,
  conviccion: (r) => r.conviction,
  cuando: (r) => r.lead.at,
  estado: (r) => (r.b.status === "ok" ? 0 : r.b.status === "tienes" ? 1 : 2),
};
/** Al pulsar una cabecera por primera vez: de mayor a menor salvo en texto, stop (menos riesgo) y estado. */
const ASC_FIRST: SortKey[] = ["valor", "stop", "estado"];

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
  const [info, setInfo] = useState<{ idea: TradeIdea; executable: boolean } | null>(null);
  const [confirm, setConfirm] = useState<TradeIdea | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "estado", dir: 1 });
  const [open, setOpen] = useState<string | null>(null);

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

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const list = data.buys.map((b) => {
      const lead = b.agents.find((a) => a.agent === b.lead) ?? b.agents[0];
      return {
        b,
        lead,
        moved: lead.price ? ((b.price - lead.price) / lead.price) * 100 : 0,
        risk: b.stop !== null ? ((b.price - b.stop) / b.price) * 100 : null,
        upside: b.target !== null ? ((b.target - b.price) / b.price) * 100 : null,
        notional: b.quantity ? b.quantity * b.price : null,
        conviction: Math.max(...b.agents.map((a) => a.conviction)),
      };
    });
    const f = SORT[sort.key];
    // Desempate estable: más agentes y más convicción primero.
    return list.sort((x, y) => {
      const a = f(x);
      const b = f(y);
      const c = a < b ? -1 : a > b ? 1 : 0;
      return c * sort.dir || (SORT.agentes(y) as number) - (SORT.agentes(x) as number);
    });
  }, [data, sort]);

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

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;

  const pick = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: ASC_FIRST.includes(key) ? 1 : -1 }));
  const head = (k: SortKey, label: string, align: "left" | "right" | "center" = "left") => (
    <SortHeader k={k} label={label} align={align} sort={sort} onPick={pick} />
  );
  const cols = 10;

  return (
    <div className="space-y-6">
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data.account.opened && <OpenAccount compact />}

      {data.sells.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-100 bg-amber-50/60">
          <h2 className="flex items-center gap-3 border-b border-amber-100 px-5 py-4 text-base font-semibold text-amber-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
            Los agentes venden algo que tú tienes
          </h2>
          <ul className="divide-y divide-amber-100">
            {data.sells.map((s) => (
              <li key={s.symbol} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 max-w-3xl text-sm">
                  <AssetIcon symbol={s.symbol} name={s.name} size="sm" className="mr-2 align-middle" />
                  <b className="font-semibold text-slate-900">{s.name}</b>
                  <span className="text-slate-600"> · lo vende {names(s.agents.map((a) => a.name))}</span>
                  <p className="mt-1 text-slate-600">
                    <Rich text={s.agents[0].rationale} />
                  </p>
                </div>
                <button type="button" className={ghost} disabled={selling === s.positionId} onClick={() => void sell(s.positionId, s.name, s.positionStatus === "pendiente")}>
                  {selling === s.positionId && <Loader2 className="h-4 w-4 animate-spin" />}
                  {s.positionStatus === "pendiente" ? "Cancelar mi orden" : "Vender la mía"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Ahora mismo no hay compras de los agentes. {MEETINGS_TEXT}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-slate-100">
              <tr>
                {head("valor", "Valor")}
                {head("agentes", "Quién la compra")}
                {head("precio", "Precio", "right")}
                {head("cambio", "Desde la compra", "right")}
                {head("stop", "Stop", "right")}
                {head("objetivo", "Objetivo", "right")}
                {head("importe", "Para ti", "right")}
                {head("conviccion", "Convicción", "center")}
                {head("estado", "Estado")}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { b, lead } = r;
                const st = STATUS[b.status];
                const expanded = open === b.symbol;
                const q = b.quantity ?? 0;
                return (
                  <Fragment key={b.symbol}>
                    <tr className={`border-b border-slate-100/80 transition-colors ${expanded ? "bg-slate-50/70" : "hover:bg-slate-50/50"}`}>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5">
                          <AssetIcon symbol={b.symbol} name={b.name} />
                          <span>
                            <span className="block font-semibold text-slate-900">{b.name}</span>
                            <span className="block text-xs text-slate-500">
                              {b.market === "crypto" ? "Crypto" : "Bolsa"} · {ago(lead.at)}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center">
                          {b.agents.map((a, k) => (
                            <span key={a.agent} className={k ? "-ml-1.5 rounded-full ring-2 ring-white" : "rounded-full ring-2 ring-white"} title={`${a.name} · convicción ${a.conviction}/5`}>
                              <AgentAvatar color={a.color} size="sm" />
                            </span>
                          ))}
                          <span className="ml-2 text-xs text-slate-600">{b.agents.length > 1 ? `${b.agents.length} agentes` : lead.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{eur(b.price)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${r.moved > 0.05 ? "text-emerald-700" : r.moved < -0.05 ? "text-red-700" : "text-slate-500"}`}>{pct(r.moved)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="text-red-700">{eur(b.stop)}</span>
                        {r.risk !== null && <span className="block text-xs text-slate-400">−{pct(r.risk, 1, false)}</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="text-emerald-700">{eur(b.target)}</span>
                        {r.upside !== null && <span className="block text-xs text-slate-400">{pct(r.upside)}</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {b.status === "ok" && q ? (
                          <>
                            <span className="font-medium text-slate-900">{eur0(r.notional)}</span>
                            <span className="block text-xs text-slate-500">
                              {int(q)} {unit(b)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex gap-0.5" title={`${r.conviction} de 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} className={`h-1.5 w-3 rounded-full ${n <= r.conviction ? "bg-blue-600" : "bg-slate-200"}`} />
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span title={st.text}>
                          <Pill color={st.color}>{st.label}</Pill>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={`${primary} px-3 py-1.5`}
                            disabled={b.status !== "ok" || !data.account.opened || !q}
                            title={b.status !== "ok" ? st.text : !data.account.opened ? "Abre tu cuenta primero" : "Ver la operación y ejecutarla"}
                            onClick={() => setInfo({ idea: ideaOf(b), executable: true })}
                          >
                            <Play className="h-3.5 w-3.5" /> Ejecutar
                          </button>
                          <button type="button" className={`${ghost} px-3 py-1.5`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.symbol)}>
                            Detalles <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </button>
                        </span>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100/80 bg-slate-50/70">
                        <td colSpan={cols} className="px-6 pb-5 pt-1">
                          <Details b={b} lead={lead} cash={data.account.cash} reserved={data.account.reserved} onMoreInfo={() => setInfo({ idea: ideaOf(b), executable: false })} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {info && (
        <TradeInfoModal
          idea={info.idea}
          onClose={() => setInfo(null)}
          onExecute={
            info.executable && data.account.opened && data.buys.find((x) => x.symbol === info.idea.symbol)?.status === "ok"
              ? () => {
                  setConfirm(info.idea);
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

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Cabecera que ordena la tabla al pulsarla (otra vez: invierte el orden). */
function SortHeader({
  k,
  label,
  align,
  sort,
  onPick,
}: {
  k: SortKey;
  label: string;
  align: keyof typeof ALIGN;
  sort: { key: SortKey; dir: 1 | -1 };
  onPick: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={`px-3 py-2.5 ${ALIGN[align]} text-[11px] font-semibold uppercase tracking-wide`} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onPick(k)}
        className={`inline-flex items-center gap-1 uppercase ${active ? "text-slate-900" : "text-slate-400 hover:text-slate-700"} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-60"}`} />
      </button>
    </th>
  );
}

/** Lo que se ve al desplegar una fila: el porqué, qué te juegas y qué dice cada agente. */
function Details({ b, lead, cash, reserved, onMoreInfo }: { b: Buy; lead: Buy["agents"][number]; cash: number; reserved: number; onMoreInfo: () => void }) {
  const q = b.quantity ?? 0;
  const loss = b.stop !== null && q ? (b.price - b.stop) * q : null;
  const gain = b.target !== null && q ? (b.target - b.price) * q : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <p className="text-sm leading-relaxed text-slate-700">
          <Rich text={lead.rationale} />
        </p>
        <div className="space-y-4">
          {b.agents.map((a) => (
            <div key={a.agent} className="text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                <AgentAvatar color={a.color} size="sm" /> {a.name}
                <span className="font-normal text-slate-500">
                  · convicción {a.conviction}/5 · lo decidió a {eur(a.price)} · stop {eur(a.stop)} · objetivo {eur(a.target)} · {a.horizonDays} días
                </span>
              </div>
              {b.agents.length > 1 && a.agent !== lead.agent && (
                <p className="mt-1 text-slate-600">
                  <Rich text={a.rationale} />
                </p>
              )}
              {a.risks && <p className="mt-1 text-xs text-slate-500">Riesgo: {a.risks}</p>}
              {a.evidence.length > 0 && (
                <div className="mt-2">
                  <EvidenceList items={a.evidence} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <aside className="space-y-3 text-sm">
        <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Con tu cartera</div>
          {b.status === "ok" && q ? (
            <ul className="mt-2 space-y-1 tabular-nums">
              <li className="flex justify-between gap-3">
                <span className="text-slate-500">Efectivo libre</span>
                <span className="text-slate-700">
                  {eur0(cash)}
                  {reserved > 0.5 && <span className="block text-right text-xs text-slate-400">{eur0(reserved)} reservados</span>}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-slate-500">Compras</span>
                <b className="font-semibold text-slate-900">
                  {int(q)} {unit(b)} · {eur0(q * b.price)}
                </b>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-slate-500">Si sale mal</span>
                <b className="font-semibold text-red-700">−{eur0(loss)}</b>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-slate-500">Si sale bien</span>
                <b className="font-semibold text-emerald-700">+{eur0(gain)}</b>
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-slate-600">{STATUS[b.status].text}</p>
          )}
        </div>
        <button type="button" className={`${ghost} w-full`} onClick={onMoreInfo}>
          Ver ficha completa
        </button>
      </aside>
    </div>
  );
}
