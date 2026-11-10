"use client";
// Abrir cuenta: el usuario elige con cuánto dinero virtual empieza.
import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { api, errorText, eur0, field, panel, primary } from "./format";
import { refreshTrading } from "./navigation";

const PRESETS = [500, 1000, 5000, 10_000];

export function OpenAccount({ compact = false }: { compact?: boolean }) {
  const [capital, setCapital] = useState("1000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(capital.replace(/\./g, "").replace(",", "."));
  const valid = value >= 500 && value <= 100_000;

  const open = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("account/open", { capital: value });
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${panel} ${compact ? "px-4 py-4" : "px-6 py-6"}`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Wallet className="h-5 w-5 text-blue-600" /> Abre tu cuenta
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Es dinero virtual: no pagas nada ni arriesgas nada. Elige con cuánto empiezas. Si pones lo que de verdad invertirías, te sirve de ensayo real
        antes de usar tu dinero.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setCapital(String(p))}
            className={`border px-3 py-2 text-sm font-medium tabular-nums ${value === p ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            {eur0(p)}
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          otra cantidad
          <input className={`${field} w-32 tabular-nums`} inputMode="numeric" value={capital} onChange={(e) => setCapital(e.target.value)} aria-label="Capital inicial en euros" />
          €
        </label>
      </div>
      {!valid && <p className="mt-2 text-xs text-amber-700">Entre 500 € y 100.000 €.</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button type="button" className={`${primary} mt-4`} disabled={!valid || saving} onClick={() => void open()}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Abrir cuenta con {valid ? eur0(value) : "…"}
      </button>
      <p className="mt-2 text-xs text-slate-500">Sin comisiones. Podrás operar a mano con las oportunidades o copiar a los agentes.</p>
    </section>
  );
}
