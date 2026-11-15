// Esqueletos de carga: la forma de la pantalla en gris mientras llegan los datos (en vez de un panel
// vacío con un círculo girando). Sin estado: valen para el servidor (loading.tsx) y para el cliente.
import { card, flat } from "./format";

const bar = "animate-pulse rounded-md bg-slate-100";

/** Una caja gris de alto y ancho dados. */
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`block ${bar} ${className}`} />;
}

/** Lista de filas de dos líneas (móvil y tablas). */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Bone className="h-8 w-8 shrink-0 !rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <Bone className="h-3.5 w-2/5" />
            <Bone className="h-3 w-3/5" />
          </span>
          <span className="w-16 space-y-2">
            <Bone className="ml-auto h-3.5 w-14" />
            <Bone className="ml-auto h-3 w-10" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Bloque de cifras (2 × 2 en móvil, 4 en fila en pantallas anchas). */
export function SkeletonStats({ items = 4 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl bg-slate-50 px-3 py-3">
          <Bone className="h-2.5 w-16" />
          <Bone className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Pantalla genérica de Trading cargando: cabecera con cifras, una gráfica y una lista. */
export function TradingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <section className={`${card} ${flat} space-y-4 px-4 py-4 sm:px-6`}>
        <Bone className="h-4 w-40" />
        <Bone className="h-9 w-44" />
        <SkeletonStats />
        <Bone className="h-36 w-full" />
      </section>
      <section className={`${card} ${flat} overflow-hidden`}>
        <div className="px-4 pt-4">
          <Bone className="h-4 w-36" />
        </div>
        <SkeletonList />
      </section>
    </div>
  );
}
