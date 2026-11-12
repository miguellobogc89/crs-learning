"use client";
// Mi cartera: dinero real (tus exchanges y qué agente mueve cuánto) y dinero de prueba (cartera virtual).
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FlaskConical, Wallet } from "lucide-react";
import { PortfolioPanel } from "./portfolio-panel";
import { RealMoneyPanel } from "./real-money-panel";

type Kind = "real" | "prueba";

export function CarteraPanel({ onOpenChart }: { onOpenChart: (symbol: string) => void }) {
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get("dinero") === "prueba" || params.get("vista") ? "prueba" : "real");
  const pick = (k: Kind) => {
    setKind(k);
    window.history.replaceState(null, "", k === "real" ? "/trading/cartera" : "/trading/cartera?dinero=prueba");
  };
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Qué dinero" className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["real", "Dinero real", Wallet],
            ["prueba", "Dinero de prueba", FlaskConical],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => pick(k)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${kind === k ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {kind === "real" ? <RealMoneyPanel /> : <PortfolioPanel onOpenChart={onOpenChart} />}
    </div>
  );
}
