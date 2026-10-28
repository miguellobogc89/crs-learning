import type { Part } from "../classifier/contract";
import { resolveFieldSet } from "../targets/field-sets";
import { matches, type TemplateDefinition } from "./contract";

/**
 * Which imported documents have parts that no reviewed field set covers, grouped by document type, and how far each
 * type's template (if any) has got. Pure.
 */
export type ClassifiedDoc = { importId: string; importFileId: string; archivo: string; partes: Part[] };
export type TemplateRef = { id: string; nombre: string; version: number; definition: TemplateDefinition };
export type DocState = { status: "completed" | "error" | "ignored"; version: number; records: number; error: string | null };
export type PendingGroup = {
  familia: string; tipo: string; subtipo: string | null; label: string;
  documentos: { importId: string; importFileId: string; archivo: string; partes: number; estado: "pendiente" | "procesado" | "error" | "ignorado"; registros: number; error: string | null }[];
  plantilla: { id: string; nombre: string } | null;
};

const TYPE_LABEL: Record<string, string> = {
  nomina: "Nómina", recibo_pago: "Recibo de pago", extracto_bancario: "Extracto o cargo bancario", declaracion_impuestos: "Declaración de impuestos o cotizaciones",
  albaran: "Albarán", pedido: "Pedido", presupuesto: "Presupuesto", nota_gastos: "Nota de gastos", cierre_caja: "Cierre de caja", contrato: "Contrato",
  receta_escandallo: "Receta o escandallo", ficha_tecnica: "Ficha técnica", alergenos: "Alérgenos", registro_appcc: "Registro APPCC", inventario: "Inventario",
  catalogo_tarifa_proveedor: "Catálogo o tarifa de proveedor", listado_productos: "Listado de productos", listado_empleados: "Listado de empleados",
  cuadrante_turnos: "Cuadrante de turnos", ventas: "Informe de ventas", otro: "Otro documento",
};
export const typeLabel = (tipo: string, subtipo: string | null) =>
  `${TYPE_LABEL[tipo] ?? tipo.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}${subtipo ? ` (${subtipo.replace(/_/g, " ")})` : ""}`;

/** A part the invoice pipeline does not save: not for reading only, no reviewed field set (or read with low confidence). */
export const uncovered = (p: Part) => p.destino !== "knowledge" && p.familia !== "texto" && (p.confianza === "baja" || !resolveFieldSet(p.familia, p.tipo, p.subtipo));

export function pendingGroups(docs: ClassifiedDoc[], templates: TemplateRef[], states: Map<string, DocState>): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const doc of docs) {
    const byType = new Map<string, Part[]>();
    for (const p of doc.partes.filter(uncovered)) {
      // Low-confidence parts of a reviewed type are not a new type: they stay out of the templates.
      if (resolveFieldSet(p.familia, p.tipo, p.subtipo)) continue;
      const key = `${p.familia}|${p.tipo}|${p.subtipo ?? ""}`;
      byType.set(key, [...(byType.get(key) ?? []), p]);
    }
    for (const [key, partes] of byType) {
      const [familia, tipo, sub] = key.split("|");
      const subtipo = sub || null;
      const template = templates.find(t => matches(t.definition, { familia, tipo, subtipo }));
      const g = groups.get(key) ?? { familia, tipo, subtipo, label: typeLabel(tipo, subtipo), documentos: [], plantilla: template ? { id: template.id, nombre: template.nombre } : null };
      const state = template ? states.get(`${template.id}|${doc.importFileId}`) : undefined;
      // A document processed with an older version of the template is pending again.
      const current = state && state.version === template!.version;
      g.documentos.push({ importId: doc.importId, importFileId: doc.importFileId, archivo: doc.archivo, partes: partes.length,
        estado: !state || (!current && state.status !== "ignored") ? "pendiente" : state.status === "completed" ? "procesado" : state.status === "ignored" ? "ignorado" : "error",
        registros: current ? state.records : 0, error: current ? state.error : null });
      groups.set(key, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.documentos.length - a.documentos.length || a.label.localeCompare(b.label, "es"));
}
