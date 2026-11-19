export function EmptyModule({ name }: { name: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-2xl font-semibold text-blue-700">
        {name.charAt(0)}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">{name}</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
        Interior preparado. Aquí conectaremos las funcionalidades del módulo cuando llegue su migración.
      </p>
    </div>
  );
}
