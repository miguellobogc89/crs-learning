"use client";
// Control del bróker conectado a la cartera: autonomía del comité, operaciones protegidas,
// vigilancia del objetivo y vinculación de valores.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Link2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { api, errorText, eur, ghost, int, panel, th } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { ErrorNote } from "./ui";

type Bracket = {
  id: string;
  symbol: string;
  ticker: string;
  name: string;
  quantity: number;
  stop: number;
  target: number;
  plannedPrice: number;
  status: "esperando_entrada" | "protegida" | "vendiendo" | "cerrada" | "error";
  entryPrice: number | null;
  exitReason: string | null;
  note: string | null;
  source: string;
  lastCheckedAt: string | null;
  createdAt: string;
};
type BrokerInfo = {
  available: boolean;
  provider: string | null;
  environment: "demo" | "real" | null;
  autonomy: "nada" | "aprobacion" | "automatico";
  brackets: Bracket[];
  links: { symbol: string; name: string; ticker: string | null; note: string | null; checked: boolean }[];
  canManage: boolean;
};

const STATUS: Record<Bracket["status"], { label: string; tone: string }> = {
  esperando_entrada: { label: "Comprando", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  protegida: { label: "Protegida", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  vendiendo: { label: "Vendiendo", tone: "border-blue-200 bg-blue-50 text-blue-700" },
  cerrada: { label: "Cerrada", tone: "border-slate-200 bg-slate-50 text-slate-600" },
  error: { label: "Revisar", tone: "border-red-200 bg-red-50 text-red-700" },
};

const AUTONOMY = [
  { key: "nada", label: "Nada", text: "El comité solo propone; el bróker no se toca." },
  { key: "aprobacion", label: "Con mi aprobación", text: "Puedes enviar cada propuesta al bróker con un botón." },
  { key: "automatico", label: "Automático", text: "Las compras que pasan las reglas se envían solas al reunirse el comité (necesita el permiso «automático» de la conexión)." },
] as const;

const time = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "—";

export function BrokerPanel() {
  const [info, setInfo] = useState<BrokerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastRun, setLastRun] = useState<{ at: string; actions: string[] } | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api<BrokerInfo>("broker"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const guardian = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const r = await api<{ checked: number; actions: string[]; skipped?: string }>("broker/guardian", {});
      setLastRun({ at: new Date().toISOString(), actions: r.actions });
      if (r.actions.length) refreshTrading();
      else await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [load]);

  // Vigilancia mientras la pantalla está abierta: el objetivo lo comprueba la app.
  const active = info?.brackets.some((b) => b.status === "esperando_entrada" || b.status === "protegida" || b.status === "vendiendo") ?? false;
  useEffect(() => {
    if (!info?.available || !info.canManage || !active) return;
    void guardian();
    const id = window.setInterval(() => void guardian(), 60_000);
    return () => window.clearInterval(id);
  }, [info?.available, info?.canManage, active, guardian]);

  const setAutonomy = async (autonomy: BrokerInfo["autonomy"]) => {
    try {
      await api("broker/autonomy", { autonomy });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const link = async () => {
    setLinking(true);
    setLinkMsg(null);
    try {
      const r = await api<{ linked: number; pending: number }>("broker/link", { force: true });
      setLinkMsg(`${r.linked} valores vinculados${r.pending ? ` · ${r.pending} sin vincular (mira el detalle)` : ""}`);
      await load();
    } catch (e) {
      setLinkMsg(errorText(e));
    } finally {
      setLinking(false);
    }
  };

  if (!info) return error ? <ErrorNote>{error}</ErrorNote> : null;
  if (!info.available) return null;
  const linked = info.links.filter((l) => l.ticker).length;

  return (
    <section className={panel}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Comité y operaciones protegidas
          </h2>
          <p className="text-xs text-slate-500">
            El <b>stop</b> queda puesto en {info.provider ?? "el bróker"} y protege aunque la app esté cerrada. El <b>objetivo</b> lo vigila la app cada minuto
            mientras esta pantalla está abierta: al tocarlo, cancela el stop y vende.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {active && <span>{checking ? "Revisando…" : `Última revisión ${time(lastRun?.at ?? null)}`}</span>}
          <button type="button" className={ghost} onClick={() => void guardian()} disabled={checking || !info.canManage}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Revisar ahora
          </button>
        </div>
      </header>

      {error && <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {lastRun && lastRun.actions.length > 0 && (
        <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{lastRun.actions.join(" · ")}</p>
      )}

      <div className="border-b border-slate-100 px-4 py-3">
        <div className="mb-1.5 text-xs font-medium text-slate-600">¿Qué puede hacer el comité en {info.provider ?? "el bróker"}{info.environment === "demo" ? " Demo" : ""}?</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {AUTONOMY.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={!info.canManage}
              onClick={() => void setAutonomy(a.key)}
              className={`border px-3 py-2 text-left ${info.autonomy === a.key ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span className="block text-sm font-semibold text-slate-900">{a.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{a.text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr>
              <th className={th}>Valor</th>
              <th className={`${th} text-right`}>Cantidad</th>
              <th className={`${th} text-right`}>Entrada</th>
              <th className={`${th} text-right`}>Stop</th>
              <th className={`${th} text-right`}>Objetivo</th>
              <th className={th}>Estado</th>
              <th className={th}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {info.brackets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Aún no hay operaciones protegidas. Envía una propuesta del comité al bróker desde «Oportunidades».
                </td>
              </tr>
            ) : (
              info.brackets.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-900">{b.name}</div>
                    <div className="text-xs text-slate-500">
                      {b.ticker} · {b.source === "auto" ? "automática" : b.source === "comite" ? "comité" : "manual"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{int(b.quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(b.entryPrice ?? b.plannedPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-700">{eur(b.stop)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{eur(b.target)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`border px-1.5 py-0.5 text-xs font-medium ${STATUS[b.status].tone}`}>{STATUS[b.status].label}</span>
                    {b.exitReason && b.status === "cerrada" && <div className="mt-0.5 text-xs text-slate-500">por {b.exitReason}</div>}
                  </td>
                  <td className="max-w-sm px-3 py-2.5 text-xs text-slate-600">{b.note}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setShowLinks(!showLinks)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLinks ? "rotate-180" : ""}`} />
            {linked} de {info.links.length} valores de bolsa vinculados con {info.provider ?? "el bróker"}
          </button>
          <div className="flex items-center gap-2">
            {linkMsg && <span className="text-xs text-slate-600">{linkMsg}</span>}
            <button type="button" className={ghost} onClick={link} disabled={linking || !info.canManage}>
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Vincular valores
            </button>
          </div>
        </div>
        {showLinks && (
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {info.links.map((l) => (
              <li key={l.symbol} className="flex justify-between gap-2 border-b border-slate-50 py-1">
                <span className="text-slate-700">{l.name}</span>
                <span className={l.ticker ? "font-mono text-slate-500" : "text-amber-700"} title={l.note ?? ""}>
                  {l.ticker ?? (l.checked ? "sin vincular" : "sin revisar")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
