/**
 * The queue of the "Documentos de Drive" screen: drives several import batches through the pipeline while the page
 * is open (a few at a time), each one up to "Guardar en mis datos", where it stops. It never saves; `saveClean` does,
 * and only when the person asks for it. The advance and save calls are injected (testable, no React).
 */
export type QueueStatus = "en_cola" | "procesando" | "por_guardar" | "guardado" | "error";
export type QueueItem = { id: string; status: QueueStatus; phase: string; error: string | null };
type View = { status: string; phase: string; error: string | null; writing?: { status: string } };

export type QueueOptions = {
  advance: (id: string) => Promise<View>;
  onUpdate: (item: QueueItem) => void;
  onIdle?: () => void;
  sleep?: (ms: number) => Promise<void>;
  concurrency?: number;
  pollMs?: number;
};

export class IntakeQueue {
  private pending: string[] = [];
  private known = new Set<string>();
  private active = 0;
  private stopped = false;
  constructor(private options: QueueOptions) {}

  /** Adds batches (each id once while the page lives) and starts them as slots free up. */
  add(ids: string[]) {
    for (const id of ids) {
      if (this.known.has(id)) continue;
      this.known.add(id); this.pending.push(id);
      this.options.onUpdate({ id, status: "en_cola", phase: "", error: null });
    }
    this.pump();
  }
  /** Lets a finished batch be queued again (after "Continuar" on an error). */
  forget(id: string) { this.known.delete(id); }
  stop() { this.stopped = true; this.pending = []; }
  get busy() { return this.active > 0 || this.pending.length > 0; }

  private pump() {
    const limit = this.options.concurrency ?? 2;
    while (!this.stopped && this.active < limit && this.pending.length) {
      const id = this.pending.shift()!;
      this.active++;
      void this.drive(id).finally(() => {
        this.active--;
        this.pump();
        if (!this.active && !this.pending.length) this.options.onIdle?.();
      });
    }
  }

  private async drive(id: string) {
    const sleep = this.options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    const update = (status: QueueStatus, phase: string, error: string | null = null) => this.options.onUpdate({ id, status, phase, error });
    update("procesando", "");
    while (!this.stopped) {
      let view: View;
      try { view = await this.options.advance(id); }
      catch (e) { update("error", "", e instanceof Error ? e.message : String(e)); return; }
      if (view.status === "error") { update("error", view.phase, view.error); return; }
      if (view.status === "waiting" && view.phase === "escritura") { update("por_guardar", "escritura"); return; }
      if (view.status === "completed") {
        if (view.writing?.status === "completed") update("guardado", "completado");
        else update("error", view.phase, "Terminó sin poder preparar el guardado (revisa la conciliación)");
        return;
      }
      update("procesando", view.phase);
      await sleep(this.options.pollMs ?? 4000);
    }
  }
}

type Json = { estado?: string; plan?: { resumen?: { bloqueados?: number } } | null; error?: string };
export type SaveOutcome = { guardados: string[]; conDudas: string[]; errores: { id: string; error: string }[] };

/**
 * "Guardar los que no tienen dudas": saves, one after another, every batch whose plan needs no decision. Batches with
 * pending decisions are left for the person (opened one by one). Explicit action only.
 */
export async function saveClean(ids: string[], call: (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: Json }>, onProgress?: (done: number) => void): Promise<SaveOutcome> {
  const out: SaveOutcome = { guardados: [], conDudas: [], errores: [] };
  let done = 0;
  for (const id of ids) {
    try {
      const plan = await call(`/api/knowledge/intake/${id}/writing`);
      if (!plan.ok) throw new Error(plan.json.error ?? "No se pudo leer el plan");
      if (plan.json.estado === "completed") out.guardados.push(id);
      else if (plan.json.estado !== "pending" && plan.json.estado !== "error") throw new Error(plan.json.error ?? "El lote no está listo para guardar");
      else if ((plan.json.plan?.resumen?.bloqueados ?? 0) > 0) out.conDudas.push(id);
      else {
        const saved = await call(`/api/knowledge/intake/${id}/writing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisiones: {} }) });
        if (!saved.ok) throw new Error(saved.json.error ?? "No se pudo guardar");
        out.guardados.push(id);
      }
    } catch (e) { out.errores.push({ id, error: e instanceof Error ? e.message : String(e) }); }
    onProgress?.(++done);
  }
  return out;
}
