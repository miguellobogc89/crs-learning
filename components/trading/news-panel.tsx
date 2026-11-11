"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Loader2, Minus, Newspaper, RefreshCw, X } from "lucide-react";
import type { listNews, NewsRow } from "@/lib/trading/news/service";
import { CATEGORY_LABEL, type NewsCategory } from "@/lib/trading/news/sources";
import { api, errorText, ghost, int, panel } from "./format";
import { useTradingRefresh } from "./navigation";
import { ErrorNote, LoadingCard } from "./ui";

type News = Awaited<ReturnType<typeof listNews>> & { canManage: boolean };
type SyncResult = {
  feedsRead: number;
  feedsFailed: { feed: string; error: string }[];
  feedsPending: number;
  newItems: number;
  classified: number;
  discarded: number;
  pending: number;
  budgetReached: boolean;
  error: string | null;
};

const MARKETS = [
  { key: "todo", label: "Todo" },
  { key: "bolsa", label: "Bolsa" },
  { key: "crypto", label: "Crypto" },
] as const;

const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(iso));
function dayTitle(key: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Hoy";
  if (key === yesterday) return "Ayer";
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(key));
}
function ago(iso: string | null) {
  if (!iso) return "nunca";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

export function Tone({ sentiment, className = "h-4 w-4" }: { sentiment: number; className?: string }) {
  if (sentiment > 0) return <ArrowUpRight className={`${className} text-emerald-600`} aria-label="Positiva" />;
  if (sentiment < 0) return <ArrowDownRight className={`${className} text-red-600`} aria-label="Negativa" />;
  return <Minus className={`${className} text-slate-400`} aria-label="Neutra" />;
}

export function Impact({ impact }: { impact: number }) {
  return (
    <span className="inline-flex gap-0.5" title={["Ruido", "Menor", "Relevante", "Muy importante"][impact] ?? ""} aria-label={`Importancia ${impact} de 3`}>
      {[1, 2, 3].map((k) => (
        <i key={k} className={`inline-block h-1.5 w-1.5 rounded-full ${k <= impact ? (impact >= 3 ? "bg-red-500" : impact >= 2 ? "bg-amber-500" : "bg-slate-400") : "bg-slate-200"}`} />
      ))}
    </span>
  );
}

/** Una noticia en una línea principal (resumen) y una de contexto. */
export function NewsItem({
  n,
  names,
  onSymbol,
  showTime = true,
}: {
  n: NewsRow;
  names: Record<string, string>;
  onSymbol?: (s: string) => void;
  showTime?: boolean;
}) {
  return (
    <li className="flex gap-3 px-4 py-3">
      {showTime && <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">{time.format(new Date(n.publishedAt))}</span>}
      <Tone sentiment={n.sentiment} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <a href={n.url} target="_blank" rel="noopener noreferrer" className="group block text-sm leading-snug text-slate-900" title={n.title}>
          {n.summary || n.title}
          <ExternalLink className="ml-1 inline h-3 w-3 text-slate-300 group-hover:text-blue-600" />
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {n.symbols.map((s) =>
            onSymbol ? (
              <button key={s} type="button" onClick={() => onSymbol(s)} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-px font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700">
                {names[s] ?? s}
              </button>
            ) : (
              <span key={s} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-px font-medium text-slate-700">
                {names[s] ?? s}
              </span>
            ),
          )}
          {n.category && n.category !== "otro" && <span>{CATEGORY_LABEL[n.category as NewsCategory] ?? n.category}</span>}
          <Impact impact={n.impact} />
          {n.publisher && <span className="truncate">{n.publisher}</span>}
        </div>
      </div>
    </li>
  );
}

export function NewsPanel() {
  const [market, setMarket] = useState<"todo" | "bolsa" | "crypto">("todo");
  const [important, setImportant] = useState(true);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [data, setData] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const autoSynced = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const p = new URLSearchParams({ market, important: important ? "1" : "0", ...(symbol ? { symbol } : {}) });
    try {
      setData(await api<News>(`news?${p}`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [market, important, symbol]);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg("Leyendo fuentes y clasificando…");
    try {
      let fresh = 0;
      let classified = 0;
      let last: SyncResult | null = null;
      for (let round = 0; round < 6; round++) {
        last = await api<SyncResult>("news/sync", {});
        fresh += last.newItems;
        classified += last.classified;
        if (last.error || (last.pending === 0 && last.feedsPending === 0)) break;
        setSyncMsg(`${int(fresh)} noticias nuevas · quedan ${int(last.pending)} por clasificar…`);
        await load();
      }
      const parts = [`${int(fresh)} noticias nuevas`, `${int(classified)} relevantes`];
      if (last?.feedsFailed.length) parts.push(`${last.feedsFailed.length} fuentes sin responder`);
      if (last?.error) parts.push(last.error);
      setSyncMsg(parts.join(" · "));
      await load();
    } catch (e) {
      setSyncMsg(errorText(e));
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // Si hace más de media hora de la última lectura, se refresca sola al entrar.
  useEffect(() => {
    if (!data || autoSynced.current || !data.canManage) return;
    const stale = !data.lastFetchAt || Date.now() - new Date(data.lastFetchAt).getTime() > 30 * 60_000;
    if (stale) {
      autoSynced.current = true;
      void sync();
    }
  }, [data, sync]);

  const groups = useMemo(() => {
    const m = new Map<string, NewsRow[]>();
    for (const n of data?.items ?? []) {
      const k = dayKey(n.publishedAt);
      m.set(k, [...(m.get(k) ?? []), n]);
    }
    return [...m.entries()];
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {MARKETS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMarket(m.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${market === m.key ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Solo las importantes
        </label>
        {symbol && (
          <button type="button" onClick={() => setSymbol(null)} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
            {data?.names[symbol] ?? symbol} <X className="h-3 w-3" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>Actualizado {ago(data?.lastFetchAt ?? null)}</span>
          {data?.canManage && (
            <button type="button" className={ghost} onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Actualizando…" : "Actualizar"}
            </button>
          )}
        </div>
      </div>

      {syncMsg && <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">{syncMsg}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {data && data.trending.length > 0 && !symbol && (
        <section className={`${panel} px-4 py-3`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Newspaper className="h-5 w-5 text-blue-600" /> Últimas 24 horas
              </h2>
            <span className="text-xs text-slate-500">
              {int(data.today.total)} noticias relevantes · {int(data.today.important)} importantes ·{" "}
              <span className="text-emerald-700">{int(data.today.positive)} positivas</span> ·{" "}
              <span className="text-red-700">{int(data.today.negative)} negativas</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.trending.map((t) => (
              <button
                key={t.symbol}
                type="button"
                onClick={() => setSymbol(t.symbol)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm hover:border-blue-300"
                title={`${t.count} noticias, ${t.important} importantes`}
              >
                <Tone sentiment={t.tone > 0.25 ? 1 : t.tone < -0.25 ? -1 : 0} className="h-3.5 w-3.5" />
                <span className="font-medium text-slate-800">{t.name}</span>
                <span className="text-xs text-slate-400">{t.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && !data ? (
        <LoadingCard height="h-40" />
      ) : data && data.items.length === 0 ? (
        <div className={`${panel} px-4 py-8 text-center text-sm text-slate-500`}>
          {data.pending > 0
            ? `Hay ${int(data.pending)} noticias leídas pendientes de clasificar. Pulsa «Actualizar».`
            : important
              ? "No hay noticias importantes en los últimos 7 días con este filtro. Prueba a quitar «Solo las importantes»."
              : "No hay noticias con este filtro."}
        </div>
      ) : (
        groups.map(([day, items]) => (
          <section key={day} className={panel}>
            <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {dayTitle(day)}
            </h3>
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <NewsItem key={n.id} n={n} names={data!.names} onSymbol={setSymbol} />
              ))}
            </ul>
          </section>
        ))
      )}

      {data && (
        <p className="text-xs leading-relaxed text-slate-500">
          Fuentes: Google Noticias (una búsqueda por cada valor del IBEX 35 y otra general del mercado español) y CoinDesk,
          Cointelegraph, Decrypt, The Block y BeInCrypto para crypto. La IA lee el titular y la entradilla, decide a qué activo
          afecta, si es buena o mala noticia y cuánto importa; el texto resumido es suyo, el original está en el enlace.
          {data.pending > 0 && ` ${int(data.pending)} pendientes de clasificar.`} Hoy: {int(data.usage.calls)} de {int(data.usage.limit)} llamadas a la IA.
        </p>
      )}
    </div>
  );
}
