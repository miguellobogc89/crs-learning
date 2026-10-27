import type { DriveFile } from "./drive";

/**
 * Status of every document of the Drive folder, from three sources: the Drive listing, the record of what each sync
 * did with each file (connector_synced_files) and the state of the import batch it went into. Pure.
 */
export type BatchRow = {
  id: string; status: string; error: string | null;
  lecturaBase: string | null; clasificacion: string | null; verificacion: string | null; conciliacion: string | null;
  escritura: string | null; escrituraError: string | null;
};
export type BatchState = { estado: "procesando" | "por_guardar" | "guardado" | "error"; fase: string; error: string | null };

export function batchState(b: BatchRow): BatchState {
  if (b.escritura === "completed") return { estado: "guardado", fase: "completado", error: null };
  if (b.status === "intake_error") return { estado: "error", fase: "lectura", error: b.error ?? "La extracción se paró con un error" };
  if (b.lecturaBase === "error") return { estado: "error", fase: "lectura_base", error: b.error ?? "La lectura base falló" };
  if (b.conciliacion === "error") return { estado: "error", fase: "conciliacion", error: "La conciliación falló" };
  if (b.escritura === "error") return { estado: "error", fase: "escritura", error: b.escrituraError ?? "No se pudo guardar" };
  if (b.status === "intake_completed" && b.conciliacion === "completed") return { estado: "por_guardar", fase: "escritura", error: null };
  const done = (s: string | null) => s === "completed";
  const fase = !done(b.lecturaBase) ? "lectura_base" : !done(b.clasificacion) && b.clasificacion !== "error" ? "clasificacion"
    : b.status !== "intake_completed" ? "lectura" : !done(b.verificacion) && b.verificacion !== "error" ? "verificacion" : "conciliacion";
  return { estado: "procesando", fase, error: null };
}

export type FileStatus = "sin_traer" | "procesando" | "por_guardar" | "guardado" | "error" | "repetido" | "no_legible";
export type RegistryRow = { outcome: string; detail: string | null; md5: string | null; importId: string | null; syncedAt: string };
export type FileRow = {
  id: string; nombre: string; modificado: string | null; tamano: number | null;
  estado: FileStatus; fase: string | null; detalle: string | null; loteId: string | null; traido: string | null;
};

export function fileRows(files: DriveFile[], registry: Map<string, RegistryRow>, batches: Map<string, BatchState>): FileRow[] {
  return files.map(f => {
    const base = { id: f.id, nombre: f.name, modificado: f.modifiedAt, tamano: f.size, fase: null, detalle: null, loteId: null, traido: null };
    const r = registry.get(f.id);
    if (!r) return { ...base, estado: "sin_traer" as const };
    if (f.md5 && r.md5 && f.md5 !== r.md5) return { ...base, estado: "sin_traer" as const, detalle: "Cambió en Drive después de traerlo" };
    const seen = { ...base, traido: r.syncedAt };
    if (r.outcome === "duplicado") return { ...seen, estado: "repetido" as const, detalle: r.detail };
    if (r.outcome === "omitido") return { ...seen, estado: "no_legible" as const, detalle: r.detail };
    const batch = r.importId ? batches.get(r.importId) : undefined;
    if (!batch) return { ...seen, estado: "error" as const, detalle: "Su importación ya no existe" };
    return { ...seen, estado: batch.estado, fase: batch.fase, detalle: batch.error, loteId: r.importId };
  });
}

export function countByStatus(rows: FileRow[]): Record<FileStatus, number> {
  const counts = { sin_traer: 0, procesando: 0, por_guardar: 0, guardado: 0, error: 0, repetido: 0, no_legible: 0 };
  for (const r of rows) counts[r.estado]++;
  return counts;
}

/** The selected files in groups of `size` (one import batch per group). */
export const chunks = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
