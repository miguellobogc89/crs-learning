"use client";
// Pills de un agente: qué opera (Crypto / Valores) y en qué exchanges se le puede copiar. Calculado
// sobre su universo, no sobre lo que tiene ahora. En gris lo que aún no se puede usar con dinero real.
import { Coins, LineChart } from "lucide-react";
import { MARKET_LABEL, venueLabel, type AgentMarket, type VenueFit } from "@/lib/trading/agents/venues-logic";

type Venues = { markets: AgentMarket[]; venues: VenueFit[] } | null;

const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";

function title(f: VenueFit) {
  const what = f.market === "crypto" ? "monedas" : "valores";
  const part = f.fit === "all" ? `Tiene todas las ${what} que mira el agente (${f.total})` : `Tiene ${f.covered} de las ${f.total} ${what} que mira el agente: el resto de operaciones se saltan`;
  return f.ready ? part : `${part}. Aún no disponible con dinero real`;
}

export function AgentVenuePills({ v, className = "" }: { v: Venues; className?: string }) {
  if (!v) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {v.markets.map((m) => (
        <span key={m} className={`${base} bg-indigo-50 text-indigo-700`} title={m === "crypto" ? "Opera criptomonedas" : "Opera acciones de bolsa"}>
          {m === "crypto" ? <Coins className="h-3 w-3" /> : <LineChart className="h-3 w-3" />}
          {MARKET_LABEL[m]}
        </span>
      ))}
      {v.venues.length > 0 && <span className="mx-0.5 h-3 w-px bg-slate-200" aria-hidden />}
      {v.venues.map((f) => (
        <span
          key={f.id}
          title={title(f)}
          className={`${base} ${!f.ready ? "bg-slate-100 text-slate-400" : f.fit === "all" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
        >
          {venueLabel(f)}
        </span>
      ))}
    </div>
  );
}
