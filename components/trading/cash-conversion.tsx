"use client";
// Efectivo de un exchange que guarda el dinero en euros y en USDC (Binance, Coinbase) y el cambio entre
// ambos. En Europa muchas monedas solo cotizan en USDC (un dólar digital): para que las copias puedan
// comprarlas, el efectivo tiene que estar en USDC. El cambio se hace dentro del exchange y se deshace
// cuando quieras. Todo se enseña en euros.
import { useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import type { CashBalance } from "@/lib/brokers/types";
import { errorText, eur, field, ghost, num, primary } from "./format";
import { ErrorNote } from "./ui";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function CashConversion({
  connectionId,
  providerName,
  cash,
  canTrade,
  onDone,
}: {
  connectionId: string;
  providerName: string;
  cash: CashBalance[];
  canTrade: boolean;
  onDone: () => void;
}) {
  const eurCash = cash.find((c) => c.currency === "EUR") ?? { currency: "EUR", amount: 0, valueEur: 0 };
  const usdc = cash.find((c) => c.currency === "USDC") ?? { currency: "USDC", amount: 0, valueEur: 0 };
  const rate = usdc.amount > 0 ? usdc.valueEur / usdc.amount : null;
  const inUsdc = usdc.valueEur > eurCash.valueEur;
  const [to, setTo] = useState<"USDC" | "EUR" | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const open = (target: "USDC" | "EUR") => {
    setTo(target);
    setError(null);
    setDone(null);
    const all = target === "USDC" ? eurCash.amount : usdc.amount;
    setAmount(all > 0 ? String(Math.floor(all * 100) / 100).replace(".", ",") : "");
  };

  const submit = async () => {
    if (!to) return;
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!(value > 0)) return setError("Indica cuánto quieres cambiar");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brokers/convert-cash", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, to, amount: value, idempotencyKey: newKey() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo hacer el cambio");
      if (data.status === "rejected") throw new Error(`${providerName} rechazó el cambio`);
      const got = data.expected as { currency: string; amount: number } | undefined;
      setDone(got ? `Hecho: unos ${got.currency === "EUR" ? eur(got.amount, 2) : `${num(got.amount, 2)} USDC`} en tu ${providerName}.` : "Cambio enviado.");
      setTo(null);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Efectivo</div>
          <div className="mt-1 text-sm text-slate-700">
            <span className="tabular-nums">{eur(eurCash.amount, 2)}</span> en euros ·{" "}
            <span className="tabular-nums">{num(usdc.amount, 2)} USDC</span>
            {usdc.amount > 0 && <span className="text-slate-500"> (≈ {eur(usdc.valueEur, 2)})</span>}
          </div>
        </div>
        {canTrade && !to && (
          <div className="flex flex-wrap gap-2">
            {eurCash.amount > 0 && (
              <button type="button" className={inUsdc ? ghost : primary} onClick={() => open("USDC")}>
                <ArrowLeftRight className="h-4 w-4" /> Cambiar a USDC
              </button>
            )}
            {usdc.amount > 0 && (
              <button type="button" className={ghost} onClick={() => open("EUR")}>
                <ArrowLeftRight className="h-4 w-4" /> Volver a euros
              </button>
            )}
          </div>
        )}
      </div>

      {!inUsdc && eurCash.amount > 0 && !to && (
        <p className="mt-2 text-xs text-amber-700">
          Tu efectivo está en euros: en {providerName} muchas monedas solo se compran en USDC y las copias se las saltarían. Cámbialo a USDC para poder copiarlas todas.
        </p>
      )}
      {!canTrade && <p className="mt-2 text-xs text-slate-500">Para cambiar entre euros y USDC, da a esta conexión el permiso «Operar».</p>}
      {done && <p className="mt-2 text-xs text-emerald-700">{done}</p>}

      {to && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 px-3 py-3 text-sm">
          <p className="text-slate-700">
            {to === "USDC"
              ? `Se cambian tus euros a USDC (un dólar digital) dentro de tu ${providerName}; el dinero no sale de allí. Lo puedes deshacer cuando quieras con «Volver a euros».`
              : `Se cambian tus USDC a euros dentro de tu ${providerName}. Las copias solo podrán comprar las monedas que cotizan en euros.`}
          </p>
          <p className="text-xs text-slate-500">Cada cambio tiene una pequeña comisión y, mientras estés en USDC, tu saldo en euros sube o baja un poco con el dólar.</p>
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-slate-600">Cantidad ({to === "USDC" ? "€" : "USDC"})</span>
            <input className={`${field} w-36`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {to === "USDC" && rate && <span className="text-xs text-slate-500">1 USDC ≈ {eur(rate, 4)}</span>}
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {to === "USDC" ? "Cambiar a USDC" : "Volver a euros"}
            </button>
            <button type="button" className={ghost} disabled={busy} onClick={() => setTo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
