"use client";
// Comprar tú una idea de Oportunidades con tu dinero real (Bitvavo). Todo en euros y a la vista:
// cuánto pones, cuánto puedes perder y cuánto ganar. La app vigila el stop y el objetivo.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import type { getWallets } from "@/lib/trading/wallets";
import type { manualView } from "@/lib/trading/manual/service";
import { preview } from "@/lib/trading/manual/logic";
import { api, errorText, eur, field, ghost, primary } from "./format";
import { refreshTrading } from "./navigation";
import { Modal, Rich } from "./ui";

type Wallets = Awaited<ReturnType<typeof getWallets>>;
type Manual = Awaited<ReturnType<typeof manualView>>;
export type BuyIdea = { id: string; symbol: string; kind: string; price: number; invalidation: number; target: number; rationale: string };

const AMOUNTS = [10, 25, 50, 100];
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

export function ManualBuyModal({ idea, onClose }: { idea: BuyIdea; onClose: () => void }) {
  const name = idea.symbol.replace(/-EUR$/, "");
  const [info, setInfo] = useState<{ wallet: Wallets["items"][number] | null; manual: Manual } | null>(null);
  const [amount, setAmount] = useState("100");
  const [trail, setTrail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Wallets>("wallets"), api<Manual>("manual")]).then(
      ([w, m]) => {
        setInfo({ wallet: w.items.find((i) => i.operating) ?? null, manual: m });
        const cash = w.items.find((i) => i.operating)?.cash ?? null;
        if (cash !== null && cash < 100) setAmount(String(Math.max(5, Math.floor(cash * 0.98))));
      },
      (e) => setError(errorText(e)),
    );
  }, []);

  const value = Number(amount.replace(",", ".")) || 0;
  const p = useMemo(() => (value > 0 ? preview(value, idea.price, idea.invalidation, idea.target) : null), [value, idea]);
  const cash = info?.wallet?.cash ?? null;
  const max = info?.manual.maxAmount ?? 100;
  const problem = info?.manual.problem ?? null;
  const tooMuch = (cash !== null && value > cash * 0.98) || value > max;
  const valid = value >= 5 && !tooMuch && !problem;

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ quantity: number; entry: number; exchange: string }>("manual/buy", { ideaId: idea.id, amount: value, trail });
      setDone(`Comprado en ${r.exchange}: ${r.quantity} ${name} a ${eur(r.entry)}.`);
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Modal
        open
        onClose={onClose}
        title="Hecho"
        footer={
          <>
            <button type="button" className={ghost} onClick={onClose}>
              Seguir mirando
            </button>
            <Link href="/trading/cartera" className={primary} onClick={onClose}>
              Ver mi cartera
            </Link>
          </>
        }
      >
        <div className="flex gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="space-y-1 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{done}</p>
            <p>La app vigila el precio cada pocos minutos y vende sola en el stop o en el objetivo. Lo verás en «Mi cartera» → Mis operaciones.</p>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Comprar ${name}`}
      subtitle={`Con tu dinero real en ${info?.manual.exchange ?? "tu exchange"}`}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} onClick={buy} disabled={busy || !valid || !info}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Comprar {value > 0 ? eur(value, 2) : ""}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="line-clamp-3 text-[13px] text-slate-600">
          <Rich text={idea.rationale} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">¿Cuánto pones?</span>
            <span className="text-slate-500">{cash === null ? "…" : `Tienes ${eur(cash, 2)} en euros`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${value === a ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {a} €
              </button>
            ))}
            <label className="flex items-center gap-1.5">
              <input className={`${field} w-24 tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              <span className="text-slate-500">€</span>
            </label>
          </div>
          {tooMuch && (
            <p className="mt-1.5 text-xs text-rose-600">{value > max ? `Como mucho ${eur(max, 0)} por compra.` : "No tienes tantos euros libres."}</p>
          )}
        </div>

        {p && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
                <TrendingDown className="h-4 w-4" /> Si sale mal
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-rose-700">pierdes {eur(-p.loss, 2)}</div>
              <div className="text-xs text-rose-700/80">
                {pct(p.lossPct)} · vende si baja a {eur(idea.invalidation)}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <TrendingUp className="h-4 w-4" /> Si sale bien
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700">ganas {eur(p.gain, 2)}</div>
              <div className="text-xs text-emerald-700/80">
                {pct(p.gainPct)} · {trail ? "al llegar a" : "vende en"} {eur(idea.target)}
              </div>
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={trail} onChange={(e) => setTrail(e.target.checked)} />
          <span>
            <b className="font-semibold text-slate-900">Si llega al objetivo, no vender: seguir mientras suba</b>
            <span className="mt-0.5 block text-xs text-slate-500">
              El stop sube a mitad de camino (aseguras la mitad de la ganancia) y va subiendo con el precio. Vende cuando se dé la vuelta.
            </span>
          </span>
        </label>

        <p className="text-xs text-slate-500">Compra a mercado ahora, con comisiones incluidas. La app revisa el precio cada pocos minutos.</p>
        {problem && <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-800">{problem}</p>}
        {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
