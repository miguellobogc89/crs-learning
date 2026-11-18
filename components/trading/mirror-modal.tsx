"use client";
// Copiar a un agente en tu exchange de cripto: presupuesto, modo (ensayo o dinero real) y las órdenes que se han
// hecho (o se habrían hecho, en ensayo) siguiéndole.
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import type { mirrorView } from "@/lib/trading/mirror/service";
import { api, errorText, field, ghost, primary } from "./format";
import { Modal } from "./ui";
import { Money, sinceText } from "./table";
import { AgentVenuePills } from "./agent-venues";

type View = Awaited<ReturnType<typeof mirrorView>> & { canManage: boolean };
type Leg = View["mirrors"][number]["legs"][number];

const STATUS: Record<string, { label: string; tone: string }> = {
  abriendo: { label: "Comprando…", tone: "bg-sky-50 text-sky-700" },
  abierta: { label: "Abierta", tone: "bg-emerald-50 text-emerald-700" },
  vendiendo: { label: "Vendiendo…", tone: "bg-sky-50 text-sky-700" },
  cerrada: { label: "Cerrada", tone: "bg-slate-100 text-slate-700" },
  omitida: { label: "No copiada", tone: "bg-amber-50 text-amber-700" },
  error: { label: "Revisar", tone: "bg-red-50 text-red-700" },
};


export function MirrorModal({
  agent,
  name,
  venues,
  onClose,
}: {
  agent: string;
  name: string;
  /** En qué exchanges se le puede copiar (solo se enseña aquí, que es donde importa). */
  venues?: ComponentProps<typeof AgentVenuePills>["v"];
  onClose: () => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [budget, setBudget] = useState("20");
  const [mode, setMode] = useState<"ensayo" | "real">("ensayo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await api<View>("mirror");
      setView(v);
      const m = v.mirrors.find((x) => x.agent === agent);
      if (m) {
        setBudget(String(m.budget).replace(".", ","));
        setMode(m.mode);
      }
    } catch (e) {
      setError(errorText(e));
    }
  }, [agent]);
  useEffect(() => void load(), [load]);

  const m = view?.mirrors.find((x) => x.agent === agent) ?? null;
  const active = !!m?.active;
  // Agentes de cortos (ENJAMBRE): el dinero real va a Kraken Futures.
  const short = agent.startsWith("enjambre-corto") || /^enjambre-x\d+$/.test(agent);
  const realReady = view ? (short ? view.kraken.ready : view.real.ready) : false;
  const realProblemText = view ? (short ? view.kraken.problem : view.real.problem) : null;
  const b = Number(budget.replace(",", "."));
  const valid = b >= 5 && b <= (view?.maxBudget ?? 100);

  const save = async () => {
    if (mode === "real" && !window.confirm(`Vas a copiar a ${name} con DINERO REAL en tu exchange (hasta ${b} €). Cada vez que entre o salga, se enviará la orden a mercado. ¿Seguro?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api("mirror/set", { agent, budget: b, mode });
      setDone(
        mode === "real"
          ? `Copiando a ${name} con dinero real (hasta ${b} €). La próxima vez que entre, se comprará en tu exchange.`
          : `Ensayo en marcha: cada vez que ${name} entre o salga, verás aquí la orden que se habría enviado a tu exchange, sin enviarla.`,
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const stop = async () => {
    if (!window.confirm(m?.mode === "real" ? `¿Dejar de copiar a ${name}? Si tienes una posición abierta, se vende a mercado en tu exchange.` : `¿Parar el ensayo con ${name}?`)) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ sold: number; errors: string[] }>("mirror/stop", { agent });
      setDone(r.errors.length ? `Parado, pero no se pudo vender: ${r.errors.join("; ")}. Revísalo en tu exchange.` : `Has dejado de copiar a ${name}.${r.sold ? " Se ha vendido lo que tenías abierto." : ""}`);
      await load();
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
      width="max-w-3xl"
      title={active ? `Copia de ${name} con dinero real` : `Copiar a ${name} con dinero real`}
      subtitle={active ? (m!.mode === "real" ? "Dinero real" : "Ensayo: no se envía nada") : undefined}
      footer={
        <>
          {active && view?.canManage && (
            <button type="button" className={`${ghost} mr-auto text-red-700`} disabled={saving} onClick={() => void stop()}>
              Dejar de copiar
            </button>
          )}
          <button type="button" className={ghost} onClick={onClose}>
            Cerrar
          </button>
          {view?.canManage && (
            <button type="button" className={primary} disabled={!valid || saving} onClick={() => void save()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {active ? "Guardar" : mode === "real" ? "Copiar con dinero real" : "Empezar ensayo"}
            </button>
          )}
        </>
      }
    >
      {!view ? (
        error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          {venues && venues.venues.length > 0 && (
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="text-xs font-medium text-slate-600">Dónde se le puede copiar</div>
              <AgentVenuePills v={{ markets: [], venues: venues.venues }} className="mt-1.5" />
              <p className="mt-1.5 text-[11px] text-slate-500">En gris, los que aún no se pueden usar con dinero real. «2/4» = ese exchange tiene 2 de las 4 monedas que mira el agente.</p>
            </div>
          )}
          <p>
            En cuanto {name} compra o vende, se repite en tu exchange al momento con tu presupuesto (en proporción a lo que él metió). Si por lo que sea se
            retrasa, una revisión periódica lo recoge; pero nunca se copia una entrada de hace más de 30 minutos, para no comprar más caro que él.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Presupuesto (5 – {view.maxBudget} €)</span>
              <input className={`${field} mt-1 w-full text-right tabular-nums`} value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Presupuesto en euros" />
            </label>
            <div>
              <span className="text-xs font-medium text-slate-600">Modo</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMode("ensayo")} className={`rounded-xl border px-3 py-2 text-left ${mode === "ensayo" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                  <b className="block text-slate-900">Ensayo</b>
                  <span className="text-xs text-slate-500">Calcula las órdenes, no envía nada</span>
                </button>
                <button
                  type="button"
                  disabled={!realReady}
                  title={realProblemText ?? undefined}
                  onClick={() => setMode("real")}
                  className={`rounded-xl border px-3 py-2 text-left disabled:opacity-50 ${mode === "real" ? "border-red-500 bg-red-50" : "border-slate-200"}`}
                >
                  <b className="block text-slate-900">Dinero real</b>
                  <span className="text-xs text-slate-500">{short ? "Abre los mismos cortos en tu Kraken" : "Envía las órdenes a tu exchange"}</span>
                </button>
              </div>
            </div>
          </div>
          {!realReady && <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">Para el modo real: {realProblemText}.</p>}
          {!valid && <p className="text-xs text-amber-700">Elige entre 5 € y {view.maxBudget} €.</p>}
          {done && <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800">{done}</p>}
          {error && <p className="text-red-700">{error}</p>}
          {m && <Legs legs={m.legs} result={m.result} />}
        </div>
      )}
    </Modal>
  );
}

function Legs({ legs, result }: { legs: Leg[]; result: number }) {
  if (!legs.length) return <p className="text-xs text-slate-500">Aún no ha entrado en nada desde que le copias.</p>;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <b className="text-slate-900">Órdenes</b>
        <span className="text-xs text-slate-500">
          Resultado (aprox., con comisiones): <Money v={result} sign className="font-semibold" />
        </span>
      </div>
      <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Cuándo</th>
              <th className="px-2 py-2 text-left">Activo</th>
              <th className="px-2 py-2 text-center">Estado</th>
              <th className="px-2 py-2 text-right">Importe</th>
              <th className="px-2 py-2 text-right">Entrada → salida</th>
              <th className="px-2 py-2 text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((l) => {
              const st = STATUS[l.status] ?? STATUS.error;
              return (
                <tr key={l.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                    {sinceText(l.createdAt)}
                    {l.mode === "ensayo" && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px]">ensayo</span>}
                  </td>
                  <td className="px-2 py-2">
                    <b className="text-slate-900">{l.symbol.replace(/-EUR$/, "")}</b>
                    {l.note && <p className="mt-0.5 max-w-xs text-slate-500">{l.note}</p>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${st.tone}`}>{st.label}</span>
                  </td>
                  <td className="px-2 py-2 text-right">{l.amount !== null ? <Money v={l.amount} /> : "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {l.entryPrice !== null ? <Money v={l.entryPrice} /> : "—"} → {l.exitPrice !== null ? <Money v={l.exitPrice} /> : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">{l.result !== null ? <Money v={l.result} sign /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
