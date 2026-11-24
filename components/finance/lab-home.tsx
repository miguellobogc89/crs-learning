"use client";
// Laboratorio: pantallas de prueba antes de llevarlas a la app (sin menú; se entra por /finanzas/laboratorio).
import { useEffect, useState } from "react";
import { LabCategoryPicker } from "./lab-category-picker";
import { PlanPanel } from "./plan-panel";
import { LabSavingsPlan } from "./lab-savings-plan";

const VIEWS = [["minimo", "Plan de ahorro"], ["plan", "Mi plan v2"], ["selector", "Selector"]] as const;
type View = (typeof VIEWS)[number][0];

export function LabHome() {
  const [view, setView] = useState<View>("minimo");
  useEffect(() => {
    try { const v = window.sessionStorage.getItem("crs-finance:lab-view"); if (v === "selector" || v === "plan") setView(v); } catch { /* ignorar */ }
  }, []);
  const pick = (v: View) => { setView(v); try { window.sessionStorage.setItem("crs-finance:lab-view", v); } catch { /* ignorar */ } };
  return (
    <div className="space-y-4 pb-6">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:max-w-sm" role="group" aria-label="Prueba">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => pick(k)} aria-pressed={view === k}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>{label}</button>
        ))}
      </div>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {view === "minimo" ? "Laboratorio: «Crear mi plan de ahorro» con tus datos. Textos por reglas (aún sin IA). No guarda nada." : view === "plan" ? "Laboratorio: nueva versión de Mi plan con tus datos (lo que cambies se guarda de verdad). Mi plan no cambia hasta que lo decidamos." : "Laboratorio: el selector de categorías (ya está también en el detalle de cada movimiento)."}
      </p>
      {view === "minimo" ? <LabSavingsPlan /> : view === "plan" ? <PlanPanel lab /> : <LabCategoryPicker />}
    </div>
  );
}
