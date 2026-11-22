"use client";
// Laboratorio (/finanzas/laboratorio, fuera de los menús): pantalla para iterar el diseño de Plan con los datos
// reales del usuario. Solo lectura: usa los mismos endpoints que Plan y no guarda nada; lo que se prueba aquí no
// toca los paquetes reales. Lo que funcione se pasa después a Plan.
//
// Iteración 1: paquetes de inicio que proponemos nosotros, una card por paquete con su gasto del ciclo y la
// diferencia con el ciclo anterior a la misma altura.
import type { packagesView } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";

type Packages = Awaited<ReturnType<typeof packagesView>>;
type Charge = Packages["charges"][number];

/** Paquete propuesto: por categorías o por comercios (palabras del concepto). */
type Proposal = { key: string; name: string; categories?: string[]; merchants?: string[]; subtitle?: string };

// Orden = prioridad: los paquetes por comercio van primero para que, por ejemplo, un Glovo («Restaurantes») cuente
// en Comida a domicilio y no también en Ocio. Cada cargo cuenta en un solo paquete.
const PROPOSALS: Proposal[] = [
  { key: "domicilio", name: "Comida a domicilio", merchants: ["glovo", "uber eats", "ubereats", "just eat", "justeat", "deliveroo", "telepizza", "dominos", "domino s"], subtitle: "Glovo, Uber Eats, Just Eat" },
  { key: "moda", name: "Moda y complementos", merchants: ["zara", "mango", "primark", "h m", "pull bear", "pull and bear", "bershka", "stradivarius", "massimo dutti", "shein", "zalando", "springfield", "lefties", "oysho", "uniqlo", "levis", "nike", "adidas", "foot locker", "jd sports", "parfois", "pandora", "vinted"], subtitle: "Ropa, calzado, complementos" },
  { key: "fijos", name: "Gastos fijos", categories: ["suministros", "suscripciones", "prestamos"] },
  { key: "ocio", name: "Ocio", categories: ["restaurantes", "ocio", "videojuegos"] },
];

const fold = (s: string) => ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
const matches = (p: Proposal, c: Charge) => {
  if (p.categories) return p.categories.includes(c.category);
  const text = fold(`${c.description} ${c.detail}`);
  // Palabra completa: «zara» no debe coincidir con «zaragoza».
  return (p.merchants ?? []).some((m) => text.includes(` ${m} `));
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function PackageCard({ name, subtitle, current, previous }: { name: string; subtitle: string; current: number; previous: number | null }) {
  const diff = previous === null ? null : Math.round((current - previous) * 100) / 100;
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-slate-900">{name}</h3>
        <p className="mt-0.5 truncate text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-semibold tabular-nums text-slate-900">{eur(current, 2)}</p>
        {diff === null ? (
          <p className="text-xs text-slate-400">sin ciclo anterior</p>
        ) : Math.abs(diff) < 0.01 ? (
          <p className="text-xs text-slate-400">igual que el anterior</p>
        ) : (
          <p className={`text-xs font-medium tabular-nums ${diff > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {diff > 0 ? "+" : "−"}{eur(Math.abs(diff), 2)} vs anterior
          </p>
        )}
      </div>
    </article>
  );
}

export function LabPanel() {
  const { data, error } = useFinance<Packages>("packages");
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={4} />;

  const { cycle } = data;
  const prev = data.averageRanges[0] ?? null;
  // Ciclo anterior a la misma altura: desde su inicio hasta el mismo día del ciclo que hoy.
  const prevTo = prev ? (addDays(prev.start, cycle.day - 1) < prev.end ? addDays(prev.start, cycle.day - 1) : prev.end) : null;

  const charges = data.charges.filter((c) => !c.patrimonial);
  const taken = new Set<string>();
  const cards = PROPOSALS.map((p) => {
    const mine = charges.filter((c) => !taken.has(c.id) && matches(p, c));
    mine.forEach((c) => taken.add(c.id));
    const sum = (from: string, to: string) => Math.round(mine.reduce((s, c) => s + (c.date >= from && c.date <= to ? -c.amount : 0), 0) * 100) / 100;
    return {
      ...p,
      subtitle: p.subtitle ?? (p.categories ?? []).slice(0, 3).map(categoryLabel).join(", "),
      current: sum(cycle.start, cycle.end),
      previous: prev && prevTo ? sum(prev.start, prevTo) : null,
    };
  });
  // En pantalla, en el orden pensado para el usuario (no en el de prioridad de asignación).
  const order = ["fijos", "ocio", "moda", "domicilio"];
  cards.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-6">
      {cards.map((c) => <PackageCard key={c.key} name={c.name} subtitle={c.subtitle} current={c.current} previous={c.previous} />)}
    </div>
  );
}
