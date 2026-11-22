"use client";
// Laboratorio (/finanzas/laboratorio, fuera de los menús): pantalla en blanco para iterar el diseño de Plan con los
// datos reales del usuario. Solo lectura: usa los mismos endpoints que Plan y no guarda nada; lo que se prueba aquí
// no toca los paquetes reales. Lo que funcione se pasa después a Plan.
import type { budgetView, packagesView } from "@/lib/finance/service";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";

type Packages = Awaited<ReturnType<typeof packagesView>>;
type Budget = Awaited<ReturnType<typeof budgetView>>;

export function LabPanel() {
  // Cargos del último año (con concepto, cuenta, categoría y paquete), ciclo, ingreso medio y ahorro.
  const packages = useFinance<Packages>("packages");
  // Recibos recurrentes detectados (para proponer los costes fijos).
  const budget = useFinance<Budget>("budget");
  const error = packages.error ?? budget.error;
  if (error && (!packages.data || !budget.data)) return <ErrorNote>{error}</ErrorNote>;
  if (!packages.data || !budget.data) return <SkeletonList rows={4} />;

  const charges = packages.data.charges.length;
  const recurring = budget.data.recurring.filter((r) => r.amount < 0 && r.active && !r.cancelled).length;
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-xs text-slate-400">
        Datos listos: {charges} cargos del último año · {recurring} recibos recurrentes · ciclo día {packages.data.cycle.day} de {packages.data.cycle.totalDays}
      </p>
    </div>
  );
}
