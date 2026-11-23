"use client";
// Laboratorio: pantallas de prueba antes de llevarlas a la app (sin menú; se entra por /finanzas/laboratorio).
// Lo aprobado ya está en su sitio: el gráfico de gasto y «Tus grupos» en Inicio, «Tu mes» en Mi plan.
import { LabCategoryPicker } from "./lab-category-picker";

export function LabHome() {
  return (
    <div className="space-y-4 pb-6">
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Laboratorio: el selector de categorías (ya está también en el detalle de cada movimiento).</p>
      <LabCategoryPicker />
    </div>
  );
}
