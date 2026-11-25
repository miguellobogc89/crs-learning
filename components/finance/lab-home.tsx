"use client";
// Laboratorio: pantallas de prueba antes de llevarlas a la app (sin menú; se entra por /finanzas/laboratorio).
import { useEffect, useState } from "react";
import { LabCategoryPicker } from "./lab-category-picker";
import { PlanPanel } from "./plan-panel";
import { LabSavingsPlan } from "./lab-savings-plan";
import { LabDatasets } from "./lab-datasets";
import { LeftToSpend } from "./left-to-spend";

const VIEWS = [["quedan", "Te quedan"], ["datos", "Datos de prueba"], ["minimo", "Plan de ahorro"], ["plan", "Mi plan v2"], ["selector", "Selector"]] as const;
type View = (typeof VIEWS)[number][0];

export function LabHome() {
  const [view, setView] = useState<View>("quedan");
  useEffect(() => {
    try { const v = window.sessionStorage.getItem("crs-finance:lab-view"); if (v === "selector" || v === "plan" || v === "datos" || v === "quedan" || v === "minimo") setView(v); } catch { /* ignorar */ }
  }, []);
  const pick = (v: View) => { setView(v); try { window.sessionStorage.setItem("crs-finance:lab-view", v); } catch { /* ignorar */ } };
  return (
    <div className="space-y-4 pb-6">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:max-w-sm" role="group" aria-label="Prueba">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => pick(k)} aria-pressed={view === k}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>{label}</button>
        ))}
      </div>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {view === "quedan" ? "Laboratorio: Mi plan como un solo número, «te quedan X € hasta fin de mes», con tus datos. No guarda nada." : view === "datos" ? "Laboratorio: usuarios ficticios con seis meses de movimientos realistas. «Generar» pasa la clasificación de verdad (con IA). Tus datos no se tocan." : view === "minimo" ? "Laboratorio: «Crear mi plan de ahorro» con tus datos o un perfil de prueba. Propuesta con IA. No guarda nada." : view === "plan" ? "Laboratorio: nueva versión de Mi plan con tus datos (lo que cambies se guarda de verdad). Mi plan no cambia hasta que lo decidamos." : "Laboratorio: el selector de categorías (ya está también en el detalle de cada movimiento)."}
      </p>
      {view === "quedan" ? <LeftToSpend /> : view === "datos" ? <LabDatasets /> : view === "minimo" ? <LabSavingsPlan /> : view === "plan" ? <PlanPanel lab /> : <LabCategoryPicker />}
    </div>
  );
}
