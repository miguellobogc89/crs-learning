export type Source = { id: string; archivo: string; texto: string };
export type Unit = { id: string; fuenteId: string; tipo: string; inicio: number; fin: number };
export type Classification = { id: string; destino: "engine" | "knowledge" | "hibrido"; tablas: { tipo: string; columnas: string[]; filas: (string | number | boolean | null)[][] }[] };
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
        !["engine", "knowledge", "hibrido"].includes(String(u.destino)) || !Array.isArray(u.tablas)) throw new Error("Destino o unidad inválidos");
    seen.add(u.id);
    const tablas = u.tablas.map(item => {
      const t = object(item);
      if (typeof t.tipo !== "string" || !Array.isArray(t.columnas) || !t.columnas.length ||
          !t.columnas.every(c => typeof c === "string") || !Array.isArray(t.filas) ||
          !t.filas.every(r => Array.isArray(r) && r.length === (t.columnas as unknown[]).length &&
            r.every(c => c === null || ["string", "number", "boolean"].includes(typeof c)))) throw new Error("Tabla documental inválida");
      return t as Classification["tablas"][number];
    });
    return { id: u.id, destino: u.destino as Classification["destino"], tablas };
  });
}
export function deliver(loteId: string, sources: Source[], units: Unit[], classifications: Classification[]) {
  return { version: 1, loteId, unidades: units.map(unit => {
    const source = sources.find(s => s.id === unit.fuenteId)!;
    const classification = classifications.find(c => c.id === unit.id)!;
    return { id: unit.id, origen: { archivoId: source.id, archivo: source.archivo, lineaInicio: unit.inicio, lineaFin: unit.fin },
      tipo: unit.tipo, destino: classification.destino,
      contenido: { texto: source.texto.split(/\r?\n/).slice(unit.inicio-1,unit.fin).join("\n"), tablas: classification.tablas } };
  }) };
}
