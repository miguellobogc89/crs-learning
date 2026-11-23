"use client";
// Laboratorio: pantallas de prueba antes de llevarlas a la app (sin menú; se entra por /finanzas/laboratorio).
// Lo que se aprueba pasa a su sitio: el gráfico de gasto y «Tus grupos» ya están en Inicio.
import { LabCategoryPicker } from "./lab-category-picker";

export function LabHome() {
  return (
    <div className="space-y-4 pb-6">
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Laboratorio: pruebas de pantallas. Ahora mismo, el selector de categorías (ya está también en el detalle de cada movimiento).</p>
      <LabCategoryPicker />
    </div>
  );
}
