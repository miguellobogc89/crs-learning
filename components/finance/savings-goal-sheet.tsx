"use client";
// Editar el objetivo de ahorro (25/11/2026): lo que quieres apartar en cada ciclo, de nómina a nómina. Hoja inferior
// con la cifra grande, atajos por porcentaje de lo que sueles cobrar y qué parte es. Se guarda en tus ajustes.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { eur } from "@/components/trading/format";
import { errorText, fapi, refreshFinance } from "./api";
import { aboveKeyboard, useKeyboardInset } from "./use-keyboard-inset";

export function SavingsGoalSheet({ open, onClose, current, income }: { open: boolean; onClose: () => void; current: number | null; income: number | null }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inset = useKeyboardInset(open);
  useEffect(() => { if (open) { setValue(current ? String(Math.round(current)) : ""); setErr(null); } }, [open, current]);
  const n = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0;
  const pct = valid && income ? Math.round((n / income) * 100) : null;
  const save = async () => {
    if (!valid) { setErr("Escribe una cantidad"); return; }
    setBusy(true); setErr(null);
    try {
      await fapi("settings", { savingsGoal: Math.round(n) });
      refreshFinance();
      onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" style={aboveKeyboard(inset, false)} className="mx-auto w-full max-w-xl gap-0 rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="px-5 pb-2 pt-5">
          <SheetTitle>Objetivo de ahorro</SheetTitle>
          <SheetDescription>Lo que quieres apartar en cada ciclo, de nómina a nómina.</SheetDescription>
        </SheetHeader>
        <div className="px-5">
          <label className="mt-3 flex items-baseline justify-center gap-2">
            <input autoFocus inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d.,]/g, "")); setErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }} aria-label="Objetivo de ahorro en euros" placeholder="0"
              className="amount w-40 bg-transparent text-center text-5xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-300" />
            <span className="text-2xl font-semibold text-slate-400">€</span>
          </label>
          <p className="amount mt-1 text-center text-sm text-slate-500">{pct !== null ? `El ${pct} % de lo que sueles cobrar (${eur(income ?? 0, 0)})` : " "}</p>
          {income ? (
            <div className="mt-4 flex justify-center gap-2">
              {[10, 15, 20].map((p) => (
                <button key={p} type="button" onClick={() => setValue(String(Math.round((income * p) / 100)))}
                  className="h-9 rounded-full bg-slate-100 px-3.5 text-sm font-medium text-slate-700 active:bg-slate-200">{p} % · {eur((income * p) / 100, 0)}</button>
              ))}
            </div>
          ) : null}
          {err && <p className="mt-3 text-center text-sm text-rose-700">{err}</p>}
          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full bg-slate-100 text-[15px] font-semibold text-slate-700">Cancelar</button>
            <button type="button" onClick={() => void save()} disabled={busy} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#3478f6] text-[15px] font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
