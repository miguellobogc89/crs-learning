import type { IntakeView } from "../advance-intake";

/** One thing that happened in this window (state change, action, error), for debugging. */
export type LogEvent = { at: string; type: "estado" | "accion" | "error"; detail: string };

/**
 * Everything needed to understand an import afterwards: what happened in the window (timeline) and the full state
 * of every stage (same content as "Copiar todo"). Built in the browser; the server is not called.
 */
export function buildImportLog(batchId: string | null, events: LogEvent[], view: IntakeView | null) {
  return {
    tipo: "crs-import-log", version: 1, loteId: batchId, generado: new Date().toISOString(),
    navegador: typeof navigator === "undefined" ? null : navigator.userAgent,
    eventos: events,
    estado: view && { fase: view.phase, estado: view.status, error: view.error },
    lectura: view?.result ?? null,
    clasificacion: view?.classification?.result ?? null, errorClasificacion: view?.classification?.error ?? null,
    revision: view?.verification?.result ?? null, errorRevision: view?.verification?.error ?? null,
    conciliacion: view?.reconciliation?.result ?? null, errorConciliacion: view?.reconciliation?.error ?? null,
    escritura: view?.writing?.result ?? view?.writing?.plan ?? null, errorEscritura: view?.writing?.error ?? null,
    lecturaIndependiente: view?.verification?.references ?? null,
  };
}

export const logFileName = (batchId: string | null) =>
  `crs-import-${batchId?.slice(0, 8) ?? "sin-lote"}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
