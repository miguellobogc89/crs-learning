import type { PendingGroup } from "../templates/pending";

/**
 * What of the imports needs the person, as a few GROUPED inbox alerts (never one per document): batches waiting to be
 * saved (and how many need a decision), documents that kept no data because their type has no table, documents
 * pending or failed in a template, and readings that stopped with an error. Pure: the state in, the alerts out.
 * Each alert has a stable key (so it is updated, not repeated) and a fingerprint of what it covers (so it only
 * comes back as unread when something NEW appears).
 */
export type BatchSummary = { id: string; nombre: string; estado: "por_guardar" | "error" | "otro"; bloqueados: number; error: string | null; archivos: number };
export type Alert = { key: string; type: string; title: string; body: string; href: string; count: number; items: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sample = (names: string[], max = 3) => names.slice(0, max).join(", ") + (names.length > max ? ` y ${names.length - max} más` : "");

export function computeAlerts(input: { batches: BatchSummary[]; groups: PendingGroup[]; hasDrive: boolean }): Alert[] {
  const alerts: Alert[] = [];
  const reviewHref = input.hasDrive ? "/connectors/google-drive" : "/knowledge";

  const waiting = input.batches.filter(b => b.estado === "por_guardar");
  const doubtful = waiting.filter(b => b.bloqueados > 0);
  if (doubtful.length) alerts.push({ key: "decisiones", type: "intake.decisiones", count: doubtful.length, items: doubtful.map(b => `${b.id}:${b.bloqueados}`).sort(),
    title: `${plural(doubtful.length, "importación necesita", "importaciones necesitan")} tu decisión para guardarse`,
    body: `${plural(doubtful.reduce((n, b) => n + b.bloqueados, 0), "duda pendiente", "dudas pendientes")} (empresas sin NIF, NIF mal leídos…). Resuélvelas de una vez en «Resolver dudas y guardar».`,
    href: reviewHref });
  const clean = waiting.filter(b => b.bloqueados === 0);
  if (clean.length) alerts.push({ key: "por_guardar", type: "intake.por_guardar", count: clean.length, items: clean.map(b => b.id).sort(),
    title: `${plural(clean.length, "importación lista", "importaciones listas")} para guardar`,
    body: `${plural(clean.reduce((n, b) => n + b.archivos, 0), "documento leído y revisado", "documentos leídos y revisados")}, sin dudas. Se guardan con «Guardar los que no tienen dudas».`,
    href: reviewHref });

  for (const g of input.groups) {
    const typeKey = `${g.familia}|${g.tipo}|${g.subtipo ?? ""}`;
    if (!g.plantilla) {
      const docs = g.documentos.filter(d => d.estado !== "ignorado");
      if (!docs.length) continue;
      alerts.push({ key: `sin_tabla:${typeKey}`, type: "intake.sin_tabla", count: docs.length, items: docs.map(d => d.importFileId).sort(),
        title: `${plural(docs.length, "documento", "documentos")} de tipo «${g.label}» sin guardar`,
        body: `Se importaron pero no guardan datos porque su tipo todavía no tiene tabla (${sample(docs.map(d => d.archivo))}). Créala desde Analítica → Sin tabla.`,
        href: `/analytics?view=tablas&sintabla=${encodeURIComponent(typeKey)}` });
      continue;
    }
    const pending = g.documentos.filter(d => d.estado === "pendiente");
    if (pending.length) alerts.push({ key: `plantilla_pendiente:${g.plantilla.id}`, type: "intake.plantilla_pendiente", count: pending.length, items: pending.map(d => d.importFileId).sort(),
      title: `${plural(pending.length, "documento nuevo", "documentos nuevos")} para «${g.plantilla.nombre}»`,
      body: `${sample(pending.map(d => d.archivo))}. Se procesan al abrir su tabla en Analítica.`, href: `/analytics?view=tablas&table=${encodeURIComponent(`plantilla:${g.plantilla.id}`)}` });
    const failed = g.documentos.filter(d => d.estado === "error");
    if (failed.length) alerts.push({ key: `plantilla_error:${g.plantilla.id}`, type: "intake.plantilla_error", count: failed.length, items: failed.map(d => d.importFileId).sort(),
      title: `${plural(failed.length, "documento", "documentos")} de «${g.plantilla.nombre}» no se pudieron procesar`,
      body: `${sample(failed.map(d => `${d.archivo}${d.error ? ` (${d.error})` : ""}`), 2)}. Vuelve a intentarlo desde su tabla en Analítica.`, href: `/analytics?view=tablas&table=${encodeURIComponent(`plantilla:${g.plantilla.id}`)}` });
  }

  const failed = input.batches.filter(b => b.estado === "error");
  if (failed.length) alerts.push({ key: "errores", type: "intake.errores", count: failed.length, items: failed.map(b => b.id).sort(),
    title: `${plural(failed.length, "importación se paró", "importaciones se pararon")} con un error`,
    body: `${sample(failed.map(b => `${b.nombre}${b.error ? `: ${b.error}` : ""}`), 2)}. Se continúan desde «Continuar los que fallaron».`, href: reviewHref });
  return alerts;
}

/** Whether an existing alert must come back as unread: something it covers is new (not just fewer items). */
export const hasNew = (previous: string[] | undefined, current: string[]) => {
  const before = new Set(previous ?? []);
  return current.some(item => !before.has(item));
};
