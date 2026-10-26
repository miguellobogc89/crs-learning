export type Source = { id: string; archivo: string; texto: string };
export type Unit = { id: string; fuenteId: string; tipo: string; inicio: number; fin: number };
export type Classification = { id: string; destino: "engine" | "knowledge" | "hibrido"; contenidosDetectados: string[] };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON inválido");
  return value as Record<string, unknown>;
}
export function identify(value: unknown, sources: Source[]): Unit[] {
  const raw = object(value).unidades;
  if (!Array.isArray(raw) || !raw.length) throw new Error("Faltan unidades identificadas");
  const units = raw.map((item, i): Unit => {
    const u = object(item);
    if (typeof u.fuenteId !== "string" || !sources.some(s => s.id === u.fuenteId) ||
        typeof u.tipo !== "string" || !u.tipo.trim() ||
        !Number.isInteger(u.inicio) || !Number.isInteger(u.fin)) throw new Error("Unidad u origen inválido");
    return { id: `unidad-${i + 1}`, fuenteId: u.fuenteId, tipo: u.tipo, inicio: u.inicio as number, fin: u.fin as number };
  });
  for (const source of sources) {
    let next = 1;
    for (const unit of units.filter(u => u.fuenteId === source.id).sort((a,b) => a.inicio-b.inicio)) {
      if (unit.inicio !== next || unit.fin < unit.inicio) throw new Error("La identificación omite o solapa contenido");
      next = unit.fin + 1;
    }
    if (next !== source.texto.split(/\r?\n/).length + 1) throw new Error("La identificación no cubre toda la fuente");
  }
  return units;
}
export function classify(value: unknown, units: Unit[]): Classification[] {
  const raw = object(value).unidades;
  if (!Array.isArray(raw) || raw.length !== units.length) throw new Error("Clasificación incompleta");
  const seen = new Set<string>();
  return raw.map(item => {
    const u = object(item);
    if (typeof u.id !== "string" || seen.has(u.id) || !units.some(x => x.id === u.id) ||
        !["engine", "knowledge", "hibrido"].includes(String(u.destino))) throw new Error("Destino o unidad inválidos");
    seen.add(u.id);
    if (Object.keys(u).some(key => !["id", "destino", "contenidosDetectados"].includes(key)) ||
        !Array.isArray(u.contenidosDetectados) || !u.contenidosDetectados.length ||
        !u.contenidosDetectados.every(c => typeof c === "string" && c.trim().length > 0 && c.length <= 120)) {
      throw new Error("La clasificación solo admite etiquetas de contenido, sin campos, filas ni registros");
    }
    return { id: u.id, destino: u.destino as Classification["destino"], contenidosDetectados: u.contenidosDetectados as string[] };
  });
}
export function deliver(loteId: string, sources: Source[], units: Unit[], classifications: Classification[]) {
  return { version: 2, loteId, unidades: units.map(unit => {
    const source = sources.find(s => s.id === unit.fuenteId)!;
    const classification = classifications.find(c => c.id === unit.id)!;
    return { id: unit.id, origen: { archivoId: source.id, archivo: source.archivo, lineaInicio: unit.inicio, lineaFin: unit.fin },
      tipo: unit.tipo, destino: classification.destino,
      contenidosDetectados: classification.contenidosDetectados,
      contenido: { texto: source.texto.split(/\r?\n/).slice(unit.inicio-1,unit.fin).join("\n") } };
  }) };
}
