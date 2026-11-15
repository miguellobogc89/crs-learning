// Esqueletos de carga: la forma de la pantalla en gris mientras llegan los datos (en vez de un panel
// vacío con un círculo girando). Sin estado: valen para el servidor (loading.tsx) y para el cliente.

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

/**
 * Pantalla de Trading cargando, a pantalla completa y sin marco: arriba la barra de pestañas y cifras,
 * debajo la tabla (cabecera y filas) ocupando todo el ancho, como el contenido real.
 */
export function TradingSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="flex h-full min-h-[70dvh] w-full flex-col overflow-hidden" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <Bone className="h-9 w-56 !rounded-lg" />
        <div className="hidden items-center gap-6 sm:flex">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="space-y-1.5">
              <Bone className="h-2.5 w-16" />
              <Bone className="h-4 w-24" />
            </span>
          ))}
        </div>
      </div>
      <div className="hidden items-center gap-4 border-b border-slate-100 px-2 pb-3 md:flex">
        <Bone className="h-3 w-24" />
        <Bone className="ml-auto h-3 w-16" />
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-20" />
      </div>
      <ul className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-3.5">
            <Bone className="h-8 w-8 shrink-0 !rounded-full" />
            <span className="min-w-0 flex-1 space-y-2">
              <Bone className="h-3.5 w-1/3 max-w-xs" />
              <Bone className="h-3 w-1/2 max-w-md" />
            </span>
            <span className="hidden gap-8 md:flex">
              <Bone className="h-3.5 w-16" />
              <Bone className="h-3.5 w-16" />
              <Bone className="h-3.5 w-20" />
            </span>
            <span className="w-16 space-y-2 md:hidden">
              <Bone className="ml-auto h-3.5 w-14" />
              <Bone className="ml-auto h-3 w-10" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
