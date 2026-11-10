"use client";
// Inicio: la visión general para alguien que nunca ha invertido. Cuánto tiene, qué hay hoy
// que merezca la pena, cómo van sus posiciones y las noticias que importan.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, FlaskConical, Info, Newspaper, TrendingUp, Wallet } from "lucide-react";
import type { listNews } from "@/lib/trading/news/service";
import type { Overview } from "./trading-workspace";
import type { Committee, Proposal } from "./committee-panel";
import { ideaFromProposal } from "./committee-panel";
import { api, eur, eur0, ghost, int, num, panel, pct, primary, tone } from "./format";
import { useTradingRefresh } from "./navigation";
import { NewsItem } from "./news-panel";
import { ConfirmOrderModal, ideaFromRecommendation, TradeInfoModal, unitOf, type TradeIdea } from "./trade-modals";
import { Rich, StopTargetBar } from "./ui";

type News = Awaited<ReturnType<typeof listNews>>;

const MOOD = {
  alcista: { label: "sube", dot: "bg-emerald-500", text: "buen momento para comprar con cabeza" },
  bajista: { label: "baja", dot: "bg-red-500", text: "mejor ir con mucho cuidado" },
  lateral: { label: "va de lado", dot: "bg-slate-400", text: "sin una dirección clara" },
} as const;

function IdeaCard({ idea, onInfo, onExecute }: { idea: TradeIdea; onInfo: () => void; onExecute: () => void }) {
  const q = idea.quantity ?? 0;
  const loss = idea.stop !== null && q ? Math.abs(idea.price - idea.stop) * q : null;
  const gain = idea.target !== null && q ? Math.abs(idea.target - idea.price) * q : null;
  return (
    <article className={`${panel} flex flex-col`}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{idea.name}</div>
          <div className="text-xs text-slate-500">
            {idea.market === "crypto" ? "Crypto" : "Bolsa"} · {idea.origin}
          </div>
        </div>
        <span className={`shrink-0 border px-1.5 py-0.5 text-[11px] font-semibold ${idea.source === "comite" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {idea.source === "comite" ? "Comité" : "Figura"}
        </span>
      </div>
      <p className="px-4 pt-2 text-sm text-slate-800">
        <Rich text={`**Compra ${int(q)} ${unitOf(idea)}** por unos ${eur0(q * idea.price)}`} />
      </p>
      <div className="mx-4 mt-2 flex items-center justify-between gap-2 text-xs tabular-nums">
        <span className="text-red-700">Si sale mal −{eur0(loss)}</span>
        <span className="text-emerald-700">Si sale bien +{eur0(gain)}</span>
      </div>
      <div className="mt-auto flex gap-2 px-4 pb-3 pt-3">
        <button type="button" className={`${ghost} flex-1 justify-center`} onClick={onInfo}>
          <Info className="h-4 w-4" /> Más info
        </button>
        <button type="button" className={`${primary} flex-1 justify-center`} onClick={onExecute}>
          Ejecutar orden
        </button>
      </div>
    </article>
  );
}

export function HomePanel({ data, onOpenChart }: { data: Overview; onOpenChart: (symbol: string) => void }) {
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [info, setInfo] = useState<TradeIdea | null>(null);
  const [confirm, setConfirm] = useState<TradeIdea | null>(null);

  const load = useCallback(() => {
    api<Committee>("committee").then(setCommittee).catch(() => setCommittee(null));
    api<News>("news?important=1&days=3").then(setNews).catch(() => setNews(null));
  }, []);
  useEffect(() => load(), [load]);
  useTradingRefresh(load);

  // Lo más interesante de hoy: primero el comité, luego las figuras fuertes.
  const ideas = useMemo(() => {
    const out: TradeIdea[] = [];
    const fromCommittee = (committee?.latest?.proposals ?? []).filter(
      (p: Proposal) => p.status === "propuesta" && p.action === "comprar" && p.quantity,
    );
    for (const p of fromCommittee) out.push(ideaFromProposal(p));
    for (const r of data.recommendations) {
      if (out.length >= 3) break;
      if (!r.strong || r.action !== "comprar" || !r.sizing?.quantity) continue;
      if (out.some((o) => o.symbol === r.symbol)) continue;
      out.push(ideaFromRecommendation(r));
    }
    return out.slice(0, 3);
  }, [committee, data.recommendations]);

  const a = data.account;
  const open = data.openPositions;
  const bolsa = MOOD[data.regime];
  const crypto = data.cryptoRegime ? MOOD[data.cryptoRegime] : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        {/* Resumen */}
        <section className={`${panel} px-5 py-5`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Tu dinero virtual</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums text-slate-900">{eur0(a.equity)}</span>
                <span className={`text-sm font-medium ${tone(a.returnPct)}`}>{pct(a.returnPct)}</span>
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {eur0(a.cash)} en efectivo · {open.length === 1 ? "1 posición" : `${open.length} posiciones`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/trading/oportunidades" className={primary}>
                <Flame className="h-4 w-4" /> Ver oportunidades
              </Link>
              <Link href="/trading/simulador" className={ghost}>
                <FlaskConical className="h-4 w-4" /> ¿Cuánto habría ganado?
              </Link>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 ${bolsa.dot}`} /> La <b className="font-semibold">bolsa española {bolsa.label}</b>: {bolsa.text}.
            </span>
            {crypto && (
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 ${crypto.dot}`} /> Las <b className="font-semibold">crypto {crypto.label}</b>: {crypto.text}.
              </span>
            )}
          </div>
        </section>

        {/* Oportunidades */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Flame className="h-4 w-4 text-orange-500" /> Oportunidades destacadas
            </h2>
            <Link href="/trading/oportunidades" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              Ver todas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {ideas.length === 0 ? (
            <div className={`${panel} px-4 py-4 text-sm text-slate-600`}>
              {committee?.stale
                ? "El comité todavía no se ha reunido hoy. Entra en «Oportunidades» y en un minuto tendrás su propuesta."
                : "Hoy no hay ninguna operación clara. No operar también es una decisión: abajo tienes los que más fuerza tienen."}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {ideas.map((i) => (
                <IdeaCard key={i.key} idea={i} onInfo={() => setInfo(i)} onExecute={() => setConfirm(i)} />
              ))}
            </div>
          )}
        </section>

        {/* Lo que tienes */}
        <section className={panel}>
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Wallet className="h-4 w-4 text-slate-500" /> Lo que tienes
            </h2>
            <Link href="/trading/cartera" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              Mi cartera <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          {open.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-600">
              Todavía no tienes nada comprado. Empieza por una oportunidad o mira en el simulador cómo te habría ido.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {open.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpenChart(p.symbol)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{p.name}</span>
                      <span className="text-xs text-slate-500">
                        {p.status === "pendiente" ? "Se compra en la próxima apertura" : `${int(p.quantity)} a ${eur(p.entryPrice)}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`block font-semibold tabular-nums ${tone(p.unrealized)}`}>{p.unrealized !== null ? `${p.unrealized >= 0 ? "+" : ""}${eur0(p.unrealized)}` : "—"}</span>
                      {p.entryPrice && p.lastPrice && (
                        <span className={`text-xs tabular-nums ${tone(p.unrealized)}`}>{pct(((p.lastPrice - p.entryPrice) / p.entryPrice) * 100 * (p.direction === "long" ? 1 : -1))}</span>
                      )}
                    </span>
                    {p.status === "abierta" && (
                      <span className="col-span-2">
                        <StopTargetBar stop={p.stop} target={p.target} price={p.lastPrice} entry={p.entryPrice ?? p.plannedEntry} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Los que más fuerza tienen */}
        {data.trend && (
          <section className={panel}>
            <header className="border-b border-slate-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Los que más fuerza tienen
              </h2>
              <p className="text-xs text-slate-500">Lo que más ha subido en los últimos meses. Es la base de la estrategia de tendencia del simulador.</p>
            </header>
            <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
              {(["bolsa", "crypto"] as const).map((m) => {
                const t = data.trend![m];
                return (
                  <div key={m} className="px-4 py-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {m === "bolsa" ? "Bolsa" : "Crypto"} · {t.lookback} sesiones
                    </div>
                    {!t.marketOk && (
                      <p className="mb-2 text-xs text-amber-800">
                        El mercado está en fase bajista: la estrategia ahora mismo estaría <b>fuera, en efectivo</b>.
                      </p>
                    )}
                    <ol className="space-y-1.5 text-sm">
                      {t.top.map((r, k) => (
                        <li key={r.symbol}>
                          <button type="button" onClick={() => onOpenChart(r.symbol)} className="flex w-full items-center gap-2 text-left hover:text-blue-700">
                            <span className="w-4 text-xs tabular-nums text-slate-400">{k + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-slate-800">{r.name}</span>
                            {t.picks.includes(r.symbol) && <span className="border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-700">EN CARTERA</span>}
                            <span className={`tabular-nums ${tone(r.momPct)}`}>{pct(r.momPct, 0)}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Columna derecha */}
      <aside className="min-w-0 space-y-6">
        <section className="border border-blue-200 bg-blue-50/60 px-4 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FlaskConical className="h-4 w-4 text-blue-600" /> ¿Te fías? Compruébalo
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Mira <b>cuánto habrías ganado</b> siguiendo la app el último año, con tu dinero y tu nivel de riesgo, y compáralo con el mercado.
          </p>
          <Link href="/trading/simulador" className={`${primary} mt-3`}>
            Abrir el simulador <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className={panel}>
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Newspaper className="h-4 w-4 text-slate-500" /> Noticias que importan
            </h2>
            <Link href="/trading/noticias" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              Todas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          {!news ? (
            <p className="px-4 py-4 text-sm text-slate-400">Cargando…</p>
          ) : news.items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-600">Sin noticias importantes en los últimos días.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {news.items.slice(0, 8).map((n) => (
                <NewsItem key={n.id} n={n} names={news.names} showTime={false} />
              ))}
            </ul>
          )}
        </section>

        {data.backtest && (
          <p className="text-xs leading-relaxed text-slate-500">
            Datos al cierre del {data.asOf ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(data.asOf)) : "—"} ·{" "}
            {num(data.instrumentsWithData, 0)} activos analizados.
          </p>
        )}
      </aside>

      {info && (
        <TradeInfoModal
          idea={info}
          onClose={() => setInfo(null)}
          onExecute={() => {
            setConfirm(info);
            setInfo(null);
          }}
        />
      )}
      {confirm && <ConfirmOrderModal idea={confirm} cash={a.cash} onClose={() => setConfirm(null)} />}
    </div>
  );
}
