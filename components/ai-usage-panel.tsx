"use client";
// Panel «Consumo de IA»: cuánto gasta cada app (hoy, 7 y 30 días), dónde está el mayor consumo y los ajustes que
// lo controlan, cada uno con lo que pasa al subirlo o bajarlo. Los cambios se aplican en la siguiente llamada.
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gauge, Loader2 } from "lucide-react";
import type { aiUsageView } from "@/lib/ai/usage";

type View = Awaited<ReturnType<typeof aiUsageView>>;
const APPS: { key: string; label: string; note: string }[] = [
  { key: "trade", label: "Trade", note: "FARO y los agentes que deciden con IA. ENJAMBRE y CAMALEÓN no usan IA." },
  { key: "finance", label: "Finance", note: "Clasificar movimientos nuevos y el copiloto." },
  { key: "business", label: "Business", note: "El asistente. La lectura de facturas no se cuenta aquí (apenas se usa)." },
];
const PERIODS = ["Hoy", "7 días", "30 días"];
const PURPOSE: Record<string, string> = { faro: "FARO", noticias: "Noticias", kamikaze: "Kamikazes", asistente: "Asistente", copiloto: "Copiloto", clasificar: "Clasificar movimientos", analizar: "Leer extractos" };
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const tok = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(v));

export function AiUsagePanel() {
  const [data, setData] = useState<View | null>(null);
  const [period, setPeriod] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/ai-usage", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "No se pudo cargar");
    setData(j as View);
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [load]);
  const save = async (key: string, value: string | null) => {
    setSaving(key);
    setErr(null);
    try {
      const r = await fetch("/api/ai-usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar");
      setData(j as View);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  };
  const models = data ? Object.entries(data.prices) : [];
  const total = (app?: string) => (data?.usage ?? []).filter((u) => !app || u.app === app).reduce((s, u) => s + u.cost[period], 0);
  const top = data?.usage.slice().sort((a, b) => b.cost[period] - a.cost[period] || b.tokens[period] - a.tokens[period])[0];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-16 sm:py-10">
      <button type="button" onClick={() => history.back()} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Volver</button>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-950"><Gauge className="h-6 w-6 text-blue-600" /> Consumo de IA</h1>
      <p className="mt-1 text-sm text-slate-500">Cuánto gasta cada app y los ajustes que lo controlan. Los cambios se aplican en la siguiente llamada, sin volver a desplegar.</p>
      {err && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
      {!data ? (
        <div className="mt-10 flex justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            {PERIODS.map((p, i) => (
              <button key={p} type="button" onClick={() => setPeriod(i)} className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${period === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{p}</button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="text-xs font-medium text-slate-500">Total</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{eur(total())}</p></div>
            {APPS.map((a) => (
              <div key={a.key} className="rounded-2xl border border-slate-100 bg-white p-4"><p className="text-xs font-medium text-slate-500">{a.label}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{eur(total(a.key))}</p></div>
            ))}
          </div>
          {top && top.cost[period] > 0 && (
            <p className="mt-3 text-sm text-slate-600">Lo que más gasta: <b>{APPS.find((a) => a.key === top.app)?.label} · {PURPOSE[top.purpose] ?? top.purpose}</b> ({eur(top.cost[period])}).</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Estimado con el precio de cada modelo (dólares → euros). El consumo anterior a este panel se guardó sin modelo: cuenta sus tokens pero no su coste.</p>

          {APPS.map((a) => {
            const rows = data.usage.filter((u) => u.app === a.key);
            const settings = data.settings.filter((s) => s.app === a.key);
            return (
              <section key={a.key} className="mt-8 rounded-2xl border border-slate-100 bg-white p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-slate-950">{a.label}</h2>
                <p className="text-sm text-slate-500">{a.note}</p>
                {rows.length ? (
                  <div className="mt-4 overflow-x-auto"><table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400"><th className="py-1 font-medium">Uso</th><th className="py-1 text-right font-medium">Llamadas</th><th className="py-1 text-right font-medium">Tokens</th><th className="py-1 text-right font-medium">Coste</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((u) => (
                        <tr key={u.purpose}>
                          <td className="py-2 text-slate-800">{PURPOSE[u.purpose] ?? u.purpose}{u.models.length ? <span className="ml-1.5 text-xs text-slate-400">{u.models.join(", ")}</span> : null}</td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{u.calls[period]}</td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{tok(u.tokens[period])}</td>
                          <td className="py-2 text-right tabular-nums font-medium text-slate-900">{u.cost[period] ? eur(u.cost[period]) : u.unpriced ? "—" : eur(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                ) : <p className="mt-4 text-sm text-slate-400">Sin consumo en los últimos 30 días.</p>}
                <div className="mt-5 space-y-4">
                  {settings.map((s) => {
                    const current = s.value ?? s.fallback ?? "";
                    return (
                      <div key={s.key} className="border-t border-slate-100 pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-sm font-medium text-slate-900" htmlFor={s.key}>{s.label}</label>
                          <div className="flex items-center gap-2">
                            {saving === s.key && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                            {s.kind === "model" && (
                              <select id={s.key} value={current} onChange={(e) => void save(s.key, e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                                {!data.prices[current] && <option value={current}>{current || "—"}</option>}
                                {models.map(([id, p]) => <option key={id} value={id}>{p.label} · {p.input} $ / {p.output} $</option>)}
                              </select>
                            )}
                            {s.kind === "effort" && (
                              <select id={s.key} value={current || "low"} onChange={(e) => void save(s.key, e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                                <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                              </select>
                            )}
                            {s.kind === "bool" && (
                              <select id={s.key} value={current === "false" ? "false" : "true"} onChange={(e) => void save(s.key, e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                                <option value="true">Activado</option><option value="false">Apagado</option>
                              </select>
                            )}
                            {s.kind === "number" && (
                              <input id={s.key} key={current} defaultValue={current} inputMode="numeric" onBlur={(e) => e.target.value !== current && void save(s.key, e.target.value)} className="h-9 w-24 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums" />
                            )}
                            {s.value !== null && <button type="button" onClick={() => void save(s.key, null)} className="text-xs text-slate-400 hover:text-slate-700" title={`Volver al valor de Vercel (${s.fallback ?? "por defecto"})`}>Restablecer</button>}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{s.help}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <p className="mt-6 text-xs text-slate-400">Precios por millón de tokens (entrada / salida), en dólares. La salida es la parte cara: un modelo que razona más gasta más en salida.</p>
        </>
      )}
    </main>
  );
}
