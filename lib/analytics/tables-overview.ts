import type { Table } from "./compute";
import type { PendingGroup } from "../knowledge/intake/templates/pending";

/**
 * Analítica → Tablas (no table chosen): what needs the person and every table with its rows. Pure: tables and the
 * import state in, the summary out. Each item links where it is solved.
 */
export type ReviewItem = { key: string; tone: "amber" | "rose" | "blue"; title: string; detail: string; href: string; action: string };
export type TableCard = { key: string; label: string; description: string; rows: number; fromDocuments: boolean };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;
const tableHref = (key: string) => `/analytics?view=tablas&table=${encodeURIComponent(key)}`;
const typeKey = (g: PendingGroup) => `${g.familia}|${g.tipo}|${g.subtipo ?? ""}`;

export function tablesReview(input: { invoices: Table; duplicatedLines: number; groups: PendingGroup[] }): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const g of input.groups) {
    if (g.plantilla) continue;
    const docs = g.documentos.filter(d => d.estado !== "ignorado");
    if (docs.length) items.push({ key: `sin_tabla:${typeKey(g)}`, tone: "amber", title: `${g.label}: ${plural(docs.length, "documento", "documentos")} sin tabla`,
      detail: "Se importaron pero no guardan datos hasta que su tipo tenga tabla.", href: `/analytics?view=tablas&sintabla=${encodeURIComponent(typeKey(g))}`, action: "Crear tabla" });
  }
  for (const g of input.groups) {
    if (!g.plantilla) continue;
    const failed = g.documentos.filter(d => d.estado === "error").length;
    const pending = g.documentos.filter(d => d.estado === "pendiente").length;
    if (failed) items.push({ key: `error:${g.plantilla.id}`, tone: "rose", title: `${g.plantilla.nombre}: ${plural(failed, "documento con error", "documentos con error")}`,
      detail: "No se pudieron procesar. Se pueden reintentar desde la tabla.", href: tableHref(`plantilla:${g.plantilla.id}`), action: "Revisar" });
    if (pending) items.push({ key: `nuevos:${g.plantilla.id}`, tone: "blue", title: `${g.plantilla.nombre}: ${plural(pending, "documento nuevo", "documentos nuevos")}`,
      detail: "Se procesan solos al abrir la tabla.", href: tableHref(`plantilla:${g.plantilla.id}`), action: "Abrir" });
  }
  const rows = input.invoices.rows;
  const noParty = rows.filter(r => r.emisor === null || r.receptor === null).length;
  if (noParty) items.push({ key: "sin_empresa", tone: "amber", title: `${plural(noParty, "factura", "facturas")} sin emisor o receptor`,
    detail: "Filtra por «(vacío)» en Emisor o Receptor y elige la empresa en la propia celda.", href: tableHref("facturas"), action: "Revisar" });
  const noTotal = rows.filter(r => typeof r.total !== "number").length;
  if (noTotal) items.push({ key: "sin_total", tone: "amber", title: `${plural(noTotal, "factura", "facturas")} sin total`,
    detail: "No suman en los paneles. Ordena por «Total» para verlas juntas y abre el documento original.", href: tableHref("facturas"), action: "Revisar" });
  if (input.duplicatedLines) items.push({ key: "lineas_dobles", tone: "amber", title: `${plural(input.duplicatedLines, "factura", "facturas")} con líneas repetidas`,
    detail: "Las líneas suman más que la base imponible: se leyeron dos veces.", href: tableHref("facturas"), action: "Revisar" });
  return items;
}

export function tableCards(tables: Table[], fromDocuments: Set<string>): TableCard[] {
  return tables.map(t => ({ key: t.key, label: t.label, description: t.description, rows: t.rows.length, fromDocuments: fromDocuments.has(t.key) }));
}
