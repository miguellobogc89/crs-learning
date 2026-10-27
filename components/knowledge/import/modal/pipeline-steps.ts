import type { IntakeView } from "../advance-intake";

/** Plain-language state of each stage of an import, derived from the orchestrator's view (pure, testable). */
export type StepState = "done" | "running" | "waiting" | "error" | "pending" | "skipped";
export type Step = { key: string; name: string; description: string; state: StepState; summary: string | null; error: string | null };

export const STEP_ORDER = ["lectura_base", "clasificacion", "lectura", "verificacion", "conciliacion", "escritura"] as const;
const META: Record<string, { name: string; description: string }> = {
  lectura_base: { name: "Lectura", description: "Se lee el texto de cada documento, tal cual está impreso." },
  clasificacion: { name: "Clasificación", description: "Qué es cada parte: factura, ticket, condiciones legales…" },
  lectura: { name: "Extracción", description: "Se extraen solo los datos útiles de cada tipo de documento." },
  verificacion: { name: "Revisión", description: "Cada dato extraído se comprueba contra el documento." },
  conciliacion: { name: "Conciliación", description: "Qué empresas, facturas o suministros ya existían." },
  escritura: { name: "Guardado", description: "Se guardan los registros y sus relaciones en tus datos." },
};

type AnyResult = { module?: string; resumen?: Record<string, number>; archivos?: { partes?: { modo?: string; destino?: string; faltan?: string[] }[] }[] } | null;
const r = (value: unknown) => (value ?? null) as AnyResult;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summaries(view: IntakeView): Record<string, string | null> {
  const classification = r(view.classification?.result);
  const reading = r(view.result);
  const verification = r(view.verification?.result);
  const reconciliation = r(view.reconciliation?.result);
  const plan = r(view.writing?.plan), written = r(view.writing?.result);
  const parts = classification?.archivos?.flatMap(f => f.partes ?? []) ?? [];
  const targetedParts = reading?.module === "targeted_extraction" ? reading.archivos?.flatMap(f => f.partes ?? []) ?? [] : [];
  const missing = targetedParts.reduce((n, p) => n + (p.faltan?.length ?? 0), 0);
  const v = verification?.resumen;
  return {
    lectura_base: null,
    clasificacion: classification ? `${plural(classification.archivos?.length ?? 0, "documento", "documentos")} · ${plural(parts.length, "parte", "partes")}` +
      (parts.some(p => p.destino === "knowledge") ? ` · ${parts.filter(p => p.destino === "knowledge").length} solo para consulta` : "") : null,
    lectura: reading ? reading.module === "targeted_extraction"
      ? `${plural(targetedParts.filter(p => p.modo === "dirigida").length, "parte con datos", "partes con datos")}${missing ? ` · ${plural(missing, "dato obligatorio sin encontrar", "datos obligatorios sin encontrar")}` : ""}`
      : "Lectura completa de los documentos" : null,
    verificacion: v ? (verification?.module === "reading_verifier" && "comprobados" in v
      ? `${plural(v.comprobados, "valor comprobado", "valores comprobados")} · ${(v.distintos ?? 0) + (v.noEncontrados ?? 0) ? plural((v.distintos ?? 0) + (v.noEncontrados ?? 0), "a revisar", "a revisar") : "sin diferencias"}`
      : `${plural(v.probablesErrores ?? 0, "probable error", "probables errores")} · ${plural(v.aRevisar ?? 0, "a revisar", "a revisar")}`) : null,
    conciliacion: reconciliation?.resumen ? `${plural(reconciliation.resumen.nuevas, "nueva", "nuevas")} · ${plural(reconciliation.resumen.existentes, "existente", "existentes")}` +
      (reconciliation.resumen.avisos ? ` · ${plural(reconciliation.resumen.avisos, "aviso", "avisos")}` : "") : null,
    escritura: written?.resumen ? `${plural(written.resumen.creados, "registro guardado", "registros guardados")} · ${plural(written.resumen.relaciones, "relación", "relaciones")}`
      : plan?.resumen ? `${plural(plan.resumen.crear, "registro por guardar", "registros por guardar")}${plan.resumen.bloqueados ? ` · ${plural(plan.resumen.bloqueados, "decisión pendiente", "decisiones pendientes")}` : ""}` : null,
  };
}

export function deriveSteps(view: IntakeView | null, uploading = false): Step[] {
  const index = view ? STEP_ORDER.indexOf(view.phase as (typeof STEP_ORDER)[number]) : -1;
  const sums = view ? summaries(view) : {};
  const targeted = (view?.result as AnyResult)?.module === "targeted_extraction";
  return STEP_ORDER.map((key, i) => {
    let state: StepState = "pending";
    let error: string | null = null;
    if (!view) state = uploading && i === 0 ? "running" : "pending";
    else if (view.status === "completed") state = "done";
    else if (index >= 0) state = i < index ? "done" : i === index ? (view.status === "error" ? "error" : view.status === "waiting" ? "waiting" : "running") : "pending";
    if (view?.status === "error" && i === index) error = view.error;
    // A stage that failed without stopping the import (classification, verification, reconciliation).
    const own = key === "clasificacion" ? view?.classification : key === "verificacion" ? view?.verification : key === "conciliacion" ? view?.reconciliation : null;
    if (own?.status === "error") { state = "error"; error = own.error; }
    // Older full readings have no reconciliation or saving; the saving of a completed import may be pending review.
    if (view?.status === "completed" && !targeted && (key === "conciliacion" || key === "escritura")) state = "skipped";
    if (view?.status === "completed" && targeted && key === "escritura" && view.writing?.status !== "completed") state = "skipped";
    return { key, ...META[key], state, summary: sums[key] ?? null, error };
  });
}
