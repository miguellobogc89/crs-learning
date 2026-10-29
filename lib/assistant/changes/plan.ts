import type { CellValue, Column, Table } from "@/lib/analytics/compute";
import { QueryError, runQuery, type Filter, type Query, type ResultColumn } from "@/lib/assistant/data/query";

/**
 * Changes the assistant can PROPOSE to the workspace's tables, and their dry run. Nothing here writes: the plan is
 * computed against the current tables (pure), shown to the person, and only applied when they press «Aplicar» — at
 * that moment it is computed again against fresh data and applied (`apply.ts`), with everything needed to undo it.
 *
 * Operations (in order; later ones can use tables and rows created by earlier ones):
 * - crear_tabla: a new table with its columns (one of them names each row: `titulo`).
 * - añadir_columnas: new columns in a table created with the assistant; link columns («enlace») in any table.
 * - crear_filas: rows given one by one; with `clave`, a row whose key already exists is updated instead.
 * - volcar_consulta: rows taken from a query (e.g. the product catalog from the purchases), same `clave` rule.
 * - actualizar_filas: change values of the rows that match some filters.
 * - enlazar: point rows to rows of another table, by pairs of names or by matching a column.
 * - borrar_filas: remove rows (kept in history; undoable).
 * - revisar_compras: keep the review of purchase lines (lib/purchases/review) — the corrections found, or the
 *   person's answer to a doubt (content of the pack, fixed final price…). Stored apart; the invoice stays as read.
 * Only tables created with the assistant get rows or plain columns; documents' and base tables only get links.
 */
export type ColumnType = "texto" | "texto_largo" | "numero" | "entero" | "importe" | "fecha" | "si_no" | "enlace";
export type ColumnDef = { columna: string; nombre: string; tipo: ColumnType; tabla_enlazada?: string; completar?: boolean };
export type Operation =
  | { op: "crear_tabla"; tabla: string; nombre: string; descripcion?: string; titulo: string; columnas: ColumnDef[] }
  | { op: "añadir_columnas"; tabla: string; columnas: ColumnDef[] }
  | { op: "crear_filas"; tabla: string; filas: Record<string, CellValue>[]; clave?: string[] }
  | { op: "volcar_consulta"; tabla: string; consulta: Query; columnas?: Record<string, string> | string[]; clave?: string[] }
  | { op: "actualizar_filas"; tabla: string; donde: Filter[]; valores: Record<string, CellValue> }
  | { op: "enlazar"; tabla: string; columna: string; pares?: { fila: string; con: string }[]; por?: { columna_origen: string; columna_destino: string; modo?: MatchMode }; solo_sin_enlace?: boolean }
  | { op: "borrar_filas"; tabla: string; donde: Filter[] }
  | { op: "revisar_compras"; tabla?: string; casos?: string[]; productos?: string[]; proveedor?: string; ajustes?: ReviewAdjust };

/** The person's answer to a doubt: the content of one unit bought, the discount, or the real final price per L/Kg/ud. */
export type ReviewAdjust = { contenido?: number; unidad?: "L" | "Kg" | "ud"; descuento_pct?: number; precio_final?: number; nota?: string };
/** What is stored for a reviewed purchase line. */
export type ReviewValues = { caso: string; unidades: number | null; cantidad_real: number | null; unidad_real: string | null; descuento_pct: number | null;
  precio_final: number | null; ahorro: number | null; nota: string };

/** How «enlazar por» compares names: exactly, all words of the origin inside the destination, or most of them. */
export type MatchMode = "exacto" | "contiene" | "parecido";
export type EngineType = "text" | "long_text" | "decimal" | "integer" | "date" | "boolean";
/** A row id: a saved record, or `nuevo:<n>` for a row this same proposal creates. */
export type RowRef = string;
export type Action =
  | { k: "tabla"; tabla: string; typeKey: string; nombre: string; descripcion: string; titulo: string }
  | { k: "columna"; tabla: string; key: string; nombre: string; tipo: EngineType; money: boolean; orden: number; completar: boolean }
  | { k: "enlace"; tabla: string; columna: string; nombre: string; destino: string; completar: boolean }
  | { k: "insertar"; tabla: string; ref: RowRef; valores: Record<string, CellValue> }
  | { k: "actualizar"; tabla: string; ref: RowRef; valores: Record<string, CellValue> }
  | { k: "enlazar"; tabla: string; columna: string; ref: RowRef; destino: RowRef | null }
  | { k: "borrar"; tabla: string; ref: RowRef }
  | { k: "revision"; tabla: string; ref: RowRef; valores: ReviewValues };

export type TableInfo = { tableKey: string; typeKey: string | null; editable: boolean; fieldTypes?: Record<string, EngineType> };
export type PlanContext = { tables: Table[]; types: TableInfo[]; links: { from: string; columna: string; to: string }[]; typeKeys: string[] };
export type PlanStep = { texto: string; avisos: string[]; muestra?: { columnas: ResultColumn[]; filas: Record<string, CellValue>[] } };
/** After the proposal: rows the person will have to complete (columns marked «completar» left empty). */
export type Pending = { tabla: string; nombreTabla: string; columna: string; nombreColumna: string; filas: number };
export type Plan = {
  ok: boolean;
  pendientes: Pending[];
  errores: string[];
  pasos: PlanStep[];
  acciones: Action[];
  cifras: { tablas: number; columnas: number; filas_nuevas: number; filas_cambiadas: number; enlaces: number; filas_borradas: number };
};

const MAX_ROWS_PER_OP = 5000;
const MAX_ACTIONS = 30000;
const SAMPLE = 5;
const TYPE_OF: Record<ColumnType, EngineType | null> = { texto: "text", texto_largo: "long_text", numero: "decimal", entero: "integer", importe: "decimal", fecha: "date", si_no: "boolean", enlace: null };
const KIND_OF: Record<EngineType, Column["kind"]> = { text: "text", long_text: "text", decimal: "number", integer: "number", date: "date", boolean: "boolean" };

const fold = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const STOP = new Set(["de", "del", "la", "el", "los", "las", "con", "sin", "y", "en", "para", "al", "a", "un", "una"]);
/** Meaningful words of a name (no articles, no bare numbers). */
export const words = (v: unknown) => fold(v).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
const sameWord = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
/**
 * The destination that best matches a name: "contiene" needs every word of the name in the destination; "parecido"
 * at least 60% of them. Among candidates, the one with the most shared and fewest extra words; a tie is ambiguous.
 */
export function bestMatch(name: unknown, candidates: { id: string; text: unknown }[], mode: Exclude<MatchMode, "exacto">): { id: string } | { missing: boolean; ambiguous: boolean } {
  const source = words(name);
  if (!source.length) return { missing: true, ambiguous: false };
  let best: { id: string; score: number }[] = [];
  for (const c of candidates) {
    const target = words(c.text);
    if (!target.length) continue;
    const shared = source.filter(w => target.some(t => sameWord(w, t))).length;
    const coverage = shared / source.length;
    if (mode === "contiene" ? coverage < 1 : coverage < 0.6) continue;
    // Shared words first, then fewest extra words, then the shortest name (the plain version of the product).
    const score = coverage * 100 - (target.length - shared) - fold(c.text).length / 1000;
    if (!best.length || score > best[0].score) best = [{ id: c.id, score }];
    else if (score === best[0].score && !best.some(b => b.id === c.id)) best.push({ id: c.id, score });
  }
  return best.length === 1 ? { id: best[0].id } : { missing: !best.length, ambiguous: best.length > 1 };
}

/** An engine key: lowercase letters, digits and «_», starting with a letter (^[a-z][a-z0-9_]*$). */
export const slug = (s: string) => { const k = fold(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48); return k && !/^[a-z]/.test(k) ? `c_${k}`.slice(0, 48) : k; };
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;

/** A value as the column stores it ("1.234,50" → 1234.5; "31/12/2026" → "2026-12-31"; "sí" → true), or an error. */
export function coerce(value: unknown, type: EngineType): { ok: true; value: CellValue } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  switch (type) {
    case "text": case "long_text": return typeof value === "object" ? { ok: false } : { ok: true, value: String(value).trim() };
    case "decimal": case "integer": {
      let n: number | null = typeof value === "number" ? value : null;
      if (typeof value === "string") {
        const t = value.replace(/[€\s]/g, "");
        const normalized = /,\d{1,}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
        n = /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
      }
      if (n === null || !Number.isFinite(n)) return { ok: false };
      if (type === "integer") return Number.isSafeInteger(n) ? { ok: true, value: n } : { ok: false };
      return { ok: true, value: Math.round(n * 10000) / 10000 };
    }
    case "date": {
      const s = String(value).trim();
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s), es = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : es ? [es[3], es[2].padStart(2, "0"), es[1].padStart(2, "0")] : [];
      if (!y) return { ok: false };
      const out = `${y}-${m}-${d}`;
      const date = new Date(`${out}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === out ? { ok: true, value: out } : { ok: false };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      const f = fold(value);
      return ["si", "true", "1", "x"].includes(f) ? { ok: true, value: true } : ["no", "false", "0"].includes(f) ? { ok: true, value: false } : { ok: false };
    }
  }
}

type Work = { table: Table; info: TableInfo; links: Map<string, string> };

export function planChanges(ctx: PlanContext, operations: Operation[]): Plan {
  const errores: string[] = [];
  const pasos: PlanStep[] = [];
  const acciones: Action[] = [];
  const cifras = { tablas: 0, columnas: 0, filas_nuevas: 0, filas_cambiadas: 0, enlaces: 0, filas_borradas: 0 };
  const work = new Map<string, Work>();
  for (const t of ctx.tables) {
    const info = ctx.types.find(i => i.tableKey === t.key) ?? { tableKey: t.key, typeKey: null, editable: false };
    work.set(t.key, { table: { ...t, columns: [...t.columns], rows: t.rows.map(r => ({ ...r })) }, info: { ...info, fieldTypes: { ...(info.fieldTypes ?? {}) } },
      links: new Map(ctx.links.filter(l => l.from === t.key).map(l => [l.columna, l.to])) });
  }
  const typeKeys = new Set(ctx.typeKeys);
  let nextRow = 0;

  const fail = (i: number, message: string) => { errores.push(`Operación ${i + 1}: ${message}`); };
  const get = (key: string) => work.get(key) ?? work.get(`tabla:${slug(key.replace(/^tabla:/, ""))}`);
  const label = (w: Work) => `«${w.table.label}»`;
  /** Rows of a table by their name (title column), to point at them. */
  const byTitle = (w: Work) => {
    const map = new Map<string, string[]>();
    if (!w.table.title) return map;
    for (const r of w.table.rows) { const k = fold(r[w.table.title]); if (k && typeof r._id === "string") map.set(k, [...(map.get(k) ?? []), r._id]); }
    return map;
  };
  const resolveLink = (target: Work, name: unknown): { id: string } | { missing: boolean; ambiguous: boolean } => {
    const ids = byTitle(target).get(fold(name)) ?? [];
    return ids.length === 1 ? { id: ids[0] as string } : { missing: ids.length === 0, ambiguous: ids.length > 1 };
  };
  const targetLabel = (target: Work, id: string | null) => {
    if (!id || !target.table.title) return null;
    return target.table.rows.find(r => r._id === id)?.[target.table.title] ?? null;
  };
  const setLink = (w: Work, columna: string, row: Record<string, CellValue>, dest: string | null) => {
    const target = work.get(w.links.get(columna)!)!;
    row[columna] = targetLabel(target, dest);
    row[`_link_${columna}`] = dest;
    acciones.push({ k: "enlazar", tabla: w.table.key, columna, ref: row._id as string, destino: dest });
  };

  const addColumns = (i: number, w: Work, columnas: ColumnDef[], isNew: boolean): string[] | null => {
    const notes: string[] = [];
    if (!Array.isArray(columnas) || !columnas.length) { fail(i, "faltan las columnas."); return null; }
    const seen = new Set(w.table.columns.map(c => c.key));
    for (const [n, c] of columnas.entries()) {
      const key = slug(String(c?.columna ?? c?.nombre ?? ""));
      if (!key) { fail(i, `la columna ${n + 1} no tiene nombre.`); return null; }
      if (seen.has(key)) { fail(i, `${label(w)} ya tiene la columna «${key}».`); return null; }
      if (!(c.tipo in TYPE_OF)) { fail(i, `tipo de columna no válido «${c.tipo}» (texto, texto_largo, numero, entero, importe, fecha, si_no, enlace).`); return null; }
      seen.add(key);
      const nombre = String(c.nombre ?? key).trim().slice(0, 80) || key;
      if (c.tipo === "enlace") {
        const target = c.tabla_enlazada ? get(c.tabla_enlazada) : undefined;
        if (!target) { fail(i, `la columna «${nombre}» enlaza con una tabla que no existe («${c.tabla_enlazada ?? ""}»).`); return null; }
        if (!target.table.title) { fail(i, `${label(target)} no tiene una columna que nombre sus filas; no se puede enlazar.`); return null; }
        if (!w.info.typeKey && !isNew) { fail(i, `${label(w)} es una tabla calculada: no admite enlaces.`); return null; }
        if (!target.info.typeKey && !target.info.editable) { fail(i, `${label(target)} es una tabla calculada: no se puede enlazar con ella.`); return null; }
        w.links.set(key, target.table.key);
        w.table.columns.push({ key, label: nombre, filter: true, link: target.table.key, ...(c.completar ? { completar: true } : {}) });
        for (const r of w.table.rows) { r[key] = null; r[`_link_${key}`] = null; }
        acciones.push({ k: "enlace", tabla: w.table.key, columna: key, nombre, destino: target.table.key, completar: c.completar === true });
        notes.push(`«${nombre}» enlaza con ${label(target)}`);
      } else {
        if (!w.info.editable) { fail(i, `${label(w)} no se creó con el asistente: solo admite columnas de enlace.`); return null; }
        const tipo = TYPE_OF[c.tipo]!;
        w.info.fieldTypes![key] = tipo;
        w.table.columns.push({ key, label: nombre, kind: c.tipo === "importe" ? "money" : KIND_OF[tipo], ...(c.completar ? { completar: true } : {}) });
        for (const r of w.table.rows) r[key] = null;
        acciones.push({ k: "columna", tabla: w.table.key, key, nombre, tipo, money: c.tipo === "importe", orden: w.table.columns.length, completar: c.completar === true });
      }
      cifras.columnas += 1;
    }
    return notes;
  };

  /** Values of a row given by the model or a query: plain columns coerced, link columns resolved by name. */
  const prepare = (i: number, w: Work, input: Record<string, unknown>, warnings: Map<string, number>) => {
    const values: Record<string, CellValue> = {};
    const links: Record<string, string | null> = {};
    for (const [rawKey, v] of Object.entries(input ?? {})) {
      const key = w.table.columns.some(c => c.key === rawKey) ? rawKey : slug(rawKey);
      if (w.links.has(key)) {
        if (v === null || v === undefined || v === "") { links[key] = null; continue; }
        const r = resolveLink(work.get(w.links.get(key)!)!, v);
        if ("id" in r) links[key] = r.id;
        else { const w2 = r.ambiguous ? `«${v}» aparece varias veces en la tabla enlazada` : `«${v}» no está en la tabla enlazada`; warnings.set(w2, (warnings.get(w2) ?? 0) + 1); }
        continue;
      }
      const type = w.info.fieldTypes?.[key];
      if (!type) { fail(i, `${label(w)} no tiene la columna «${rawKey}».`); return null; }
      const c = coerce(v, type);
      if (!c.ok) { fail(i, `«${String(v)}» no es un valor válido para «${key}» (${type}).`); return null; }
      values[key] = c.value;
    }
    return { values, links };
  };

  const upsertRows = (i: number, w: Work, rows: Record<string, unknown>[], clave: string[] | undefined, origin: string) => {
    if (!w.info.editable) { fail(i, `${label(w)} no se creó con el asistente: no se le pueden añadir filas.`); return; }
    if (rows.length > MAX_ROWS_PER_OP) { fail(i, `son ${rows.length} filas; el máximo por operación es ${MAX_ROWS_PER_OP}.`); return; }
    const keys = (clave ?? []).map(k => w.table.columns.some(c => c.key === k) ? k : slug(k));
    for (const k of keys) if (!w.table.columns.some(c => c.key === k)) { fail(i, `la clave «${k}» no es una columna de ${label(w)}.`); return; }
    const keyOf = (r: Record<string, CellValue>) => keys.map(k => fold(r[k])).join("\u0001");
    const index = new Map<string, Record<string, CellValue>>();
    if (keys.length) for (const r of w.table.rows) index.set(keyOf(r), r);
    const warnings = new Map<string, number>();
    let created = 0, updated = 0, unchanged = 0;
    const touched: Record<string, CellValue>[] = [];
    for (const input of rows) {
      const p = prepare(i, w, input, warnings);
      if (!p) return;
      const candidate = { ...p.values, ...Object.fromEntries(Object.keys(p.links).map(k => [k, p.links[k]])) };
      const existing = keys.length ? index.get(keyOf(candidate)) : undefined;
      if (existing) {
        const changes = Object.fromEntries(Object.entries(p.values).filter(([k, v]) => fold(existing[k]) !== fold(v) || (existing[k] === null) !== (v === null)));
        const linkChanges = Object.entries(p.links).filter(([k, v]) => existing[`_link_${k}`] !== v);
        if (!Object.keys(changes).length && !linkChanges.length) { unchanged += 1; continue; }
        if (Object.keys(changes).length) { Object.assign(existing, changes); acciones.push({ k: "actualizar", tabla: w.table.key, ref: existing._id as string, valores: changes }); }
        for (const [k, v] of linkChanges) setLink(w, k, existing, v);
        updated += 1; touched.push(existing);
      } else {
        const ref = `nuevo:${++nextRow}`;
        const row: Record<string, CellValue> = { _id: ref, ...Object.fromEntries(w.table.columns.map(c => [c.key, null])), ...p.values };
        w.table.rows.push(row);
        if (keys.length) index.set(keyOf(candidate), row);
        acciones.push({ k: "insertar", tabla: w.table.key, ref, valores: p.values });
        for (const [k, v] of Object.entries(p.links)) if (v) setLink(w, k, row, v);
        created += 1; touched.push(row);
      }
    }
    cifras.filas_nuevas += created; cifras.filas_cambiadas += updated;
    const parts = [created && plural(created, "fila nueva", "filas nuevas"), updated && plural(updated, "fila actualizada", "filas actualizadas"),
      unchanged && plural(unchanged, "ya estaba igual", "ya estaban igual")].filter(Boolean);
    pasos.push({ texto: `${origin} en ${label(w)}: ${parts.join(", ") || "nada que cambiar"}.`,
      avisos: [...warnings].map(([text, n]) => `${text}${n > 1 ? ` (${n} veces)` : ""}: ese enlace queda vacío.`), muestra: sample(w, touched) });
  };

  const sample = (w: Work, rows: Record<string, CellValue>[]) => rows.length ? {
    columnas: w.table.columns.filter(c => c.kind !== "document").map(c => ({ key: c.key, label: c.label, kind: c.kind })),
    filas: rows.slice(0, SAMPLE).map(r => Object.fromEntries(w.table.columns.filter(c => c.kind !== "document").map(c => [c.key, r[c.key] ?? null]))),
  } : undefined;

  const select = (i: number, w: Work, donde: Filter[]) => {
    if (!Array.isArray(donde) || !donde.length) { fail(i, "faltan los filtros («donde») que eligen las filas."); return null; }
    try {
      const first = w.table.columns.find(c => c.kind !== "document")!.key;
      const ids = runQuery([w.table], { tabla: w.table.key, filtros: donde, columnas: [first] }, { maxLimit: MAX_ROWS_PER_OP + 1, keepIds: true }).filas.map(r => r._id as string);
      if (ids.length > MAX_ROWS_PER_OP) { fail(i, `los filtros eligen más de ${MAX_ROWS_PER_OP} filas.`); return null; }
      const set = new Set(ids);
      return w.table.rows.filter(r => set.has(r._id as string));
    } catch (e) { if (e instanceof QueryError) { fail(i, e.message); return null; } throw e; }
  };

  for (const [i, op] of (Array.isArray(operations) ? operations : []).entries()) {
    if (errores.length) break;
    if (!op || typeof op !== "object") { fail(i, "operación vacía."); break; }
    switch (op.op) {
      case "crear_tabla": {
        const typeKey = slug(op.tabla || op.nombre);
        const key = `tabla:${typeKey}`;
        if (!typeKey) { fail(i, "la tabla necesita un nombre."); break; }
        if (work.has(key) || typeKeys.has(typeKey)) { fail(i, `ya existe una tabla «${typeKey}»: usa otro nombre o añade a la existente.`); break; }
        const nombre = String(op.nombre ?? typeKey).trim().slice(0, 80);
        const titulo = slug(op.titulo ?? "");
        const titleDef = (op.columnas ?? []).find(c => slug(c.columna ?? c.nombre ?? "") === titulo);
        if (!titleDef || (titleDef.tipo !== "texto" && titleDef.tipo !== "texto_largo")) { fail(i, `«titulo» debe ser una de las columnas de texto (la que nombra cada fila).`); break; }
        const w: Work = { table: { key, label: nombre, description: String(op.descripcion ?? ""), columns: [], rows: [], title: titulo },
          info: { tableKey: key, typeKey, editable: true, fieldTypes: {} }, links: new Map() };
        work.set(key, w); typeKeys.add(typeKey);
        acciones.push({ k: "tabla", tabla: key, typeKey, nombre, descripcion: String(op.descripcion ?? "").slice(0, 500), titulo });
        const notes = addColumns(i, w, op.columnas, true);
        if (!notes) break;
        cifras.tablas += 1;
        pasos.push({ texto: `Crear la tabla «${nombre}» con ${plural(w.table.columns.length, "columna", "columnas")}: ${w.table.columns.map(c => c.label).join(", ")}.`, avisos: notes });
        break;
      }
      case "añadir_columnas": {
        const w = get(op.tabla);
        if (!w) { fail(i, `no existe la tabla «${op.tabla}».`); break; }
        const before = w.table.columns.length;
        const notes = addColumns(i, w, op.columnas, false);
        if (!notes) break;
        pasos.push({ texto: `Añadir a ${label(w)} ${plural(w.table.columns.length - before, "columna", "columnas")}: ${w.table.columns.slice(before).map(c => c.label).join(", ")}.`, avisos: notes });
        break;
      }
      case "crear_filas": {
        const w = get(op.tabla);
        if (!w) { fail(i, `no existe la tabla «${op.tabla}».`); break; }
        if (!Array.isArray(op.filas) || !op.filas.length) { fail(i, "faltan las filas."); break; }
        upsertRows(i, w, op.filas, op.clave, "Filas");
        break;
      }
      case "volcar_consulta": {
        const w = get(op.tabla);
        if (!w) { fail(i, `no existe la tabla «${op.tabla}».`); break; }
        let result;
        try { result = runQuery([...work.values()].map(x => x.table), op.consulta, { maxLimit: MAX_ROWS_PER_OP }); }
        catch (e) { if (e instanceof QueryError) { fail(i, `la consulta falla: ${e.message}`); break; } throw e; }
        if (result.truncado) { fail(i, `la consulta da ${result.total} filas; el máximo es ${MAX_ROWS_PER_OP}.`); break; }
        // Mapping destination → result column. Omitted (or a list of names): columns with the same name.
        const own = (k: string) => w.table.columns.find(c => c.key === k || c.key === slug(k));
        let mapping: Record<string, string>;
        if (op.columnas && !Array.isArray(op.columnas) && typeof op.columnas === "object" && Object.keys(op.columnas).length) mapping = op.columnas;
        else {
          const names = Array.isArray(op.columnas) && op.columnas.length ? op.columnas.map(String) : result.columnas.map(c => c.key);
          mapping = Object.fromEntries(names.filter(n => own(n) && result.columnas.some(c => c.key === n)).map(n => [own(n)!.key, n]));
        }
        if (!Object.keys(mapping).length) { fail(i, `ninguna columna del resultado (${result.columnas.map(c => c.key).join(", ")}) coincide con las de ${label(w)} (${w.table.columns.map(c => c.key).join(", ")}): indica «columnas» {destino: columna_del_resultado} o pon «nombre» en «calcular» igual que la columna de destino.`); break; }
        const missing = Object.values(mapping).filter(src => !result.columnas.some(c => c.key === src));
        if (missing.length) { fail(i, `el resultado no tiene ${missing.map(m => `«${m}»`).join(", ")} (tiene ${result.columnas.map(c => c.key).join(", ")}).`); break; }
        upsertRows(i, w, result.filas.map(r => Object.fromEntries(Object.entries(mapping).map(([dest, src]) => [dest, r[src] ?? null]))), op.clave, "Datos de la consulta");
        break;
      }
      case "actualizar_filas": {
        const w = get(op.tabla);
        if (!w) { fail(i, `no existe la tabla «${op.tabla}».`); break; }
        if (!w.info.editable) { fail(i, `${label(w)} no se creó con el asistente: sus datos se cambian desde su origen.`); break; }
        const rows = select(i, w, op.donde);
        if (!rows) break;
        const warnings = new Map<string, number>();
        const p = prepare(i, w, op.valores, warnings);
        if (!p) break;
        for (const r of rows) {
          if (Object.keys(p.values).length) { Object.assign(r, p.values); acciones.push({ k: "actualizar", tabla: w.table.key, ref: r._id as string, valores: p.values }); }
          for (const [k, v] of Object.entries(p.links)) setLink(w, k, r, v);
        }
        cifras.filas_cambiadas += rows.length;
        pasos.push({ texto: `Cambiar ${plural(rows.length, "fila", "filas")} de ${label(w)}.`, avisos: [...warnings].map(([t, n]) => `${t}${n > 1 ? ` (${n} veces)` : ""}.`), muestra: sample(w, rows) });
        break;
      }
      case "enlazar": {
        const w = get(op.tabla);
        if (!w) { fail(i, `no existe la tabla «${op.tabla}».`); break; }
        const columna = w.links.has(op.columna) ? op.columna : slug(op.columna ?? "");
        const to = w.links.get(columna);
        if (!to) { fail(i, `${label(w)} no tiene la columna de enlace «${op.columna}» (créala antes con tipo «enlace»).`); break; }
        const target = work.get(to)!;
        const pending = w.table.rows.filter(r => !op.solo_sin_enlace || !r[`_link_${columna}`]);
        let linked = 0, none = 0, many = 0;
        const touched: Record<string, CellValue>[] = [];
        if (op.por) {
          const src = op.por.columna_origen, dst = op.por.columna_destino;
          if (!w.table.columns.some(c => c.key === src)) { fail(i, `${label(w)} no tiene la columna «${src}».`); break; }
          if (!target.table.columns.some(c => c.key === dst)) { fail(i, `${label(target)} no tiene la columna «${dst}».`); break; }
          const mode = op.por.modo ?? "exacto";
          const index = new Map<string, string[]>();
          for (const r of target.table.rows) { const k = fold(r[dst]); if (k && typeof r._id === "string") index.set(k, [...(index.get(k) ?? []), r._id]); }
          const candidates = target.table.rows.filter(r => typeof r._id === "string").map(r => ({ id: r._id as string, text: r[dst] }));
          for (const r of pending) {
            const exact = index.get(fold(r[src])) ?? [];
            let id: string | null = exact.length === 1 ? exact[0] : null;
            if (!id && mode !== "exacto" && exact.length === 0) {
              const m = bestMatch(r[src], candidates, mode);
              if ("id" in m) id = m.id; else { if (m.ambiguous) many += 1; else none += 1; continue; }
            } else if (!id) { if (exact.length) many += 1; else none += 1; continue; }
            if (r[`_link_${columna}`] === id || id === r._id) continue;
            setLink(w, columna, r, id); linked += 1; touched.push(r);
          }
        } else if (Array.isArray(op.pares) && op.pares.length) {
          const own = byTitle(w);
          for (const p of op.pares) {
            const from = own.get(fold(p.fila)) ?? [];
            if (from.length !== 1) { if (from.length) many += 1; else none += 1; continue; }
            const dest = resolveLink(target, p.con);
            if (!("id" in dest)) { if (dest.ambiguous) many += 1; else none += 1; continue; }
            const row = w.table.rows.find(r => r._id === from[0])!;
            if (row[`_link_${columna}`] === dest.id) continue;
            setLink(w, columna, row, dest.id); linked += 1; touched.push(row);
          }
        } else { fail(i, "indica «pares» (fila → con) o «por» (columna_origen → columna_destino)."); break; }
        cifras.enlaces += linked;
        pasos.push({ texto: `Enlazar ${plural(linked, "fila", "filas")} de ${label(w)} con ${label(target)} («${w.table.columns.find(c => c.key === columna)?.label ?? columna}»).`,
          avisos: [none && `${plural(none, "fila sin pareja", "filas sin pareja")}: quedan sin enlazar.`, many && `${plural(many, "fila con varias parejas posibles", "filas con varias parejas posibles")}: quedan sin enlazar.`].filter(Boolean) as string[],
          muestra: sample(w, touched) });
        break;
      }
      case "borrar_filas": {
        const w = get(op.tabla);
        if (!w) { fail(i, `no existe la tabla «${op.tabla}».`); break; }
        if (!w.info.editable) { fail(i, `${label(w)} no se creó con el asistente: no se borran filas desde aquí.`); break; }
        const rows = select(i, w, op.donde);
        if (!rows) break;
        for (const r of rows) acciones.push({ k: "borrar", tabla: w.table.key, ref: r._id as string });
        const gone = new Set(rows.map(r => r._id));
        const shown = sample(w, rows);
        w.table.rows = w.table.rows.filter(r => !gone.has(r._id));
        cifras.filas_borradas += rows.length;
        pasos.push({ texto: `Borrar ${plural(rows.length, "fila", "filas")} de ${label(w)} (quedan en el historial).`, avisos: [], muestra: shown });
        break;
      }
      case "revisar_compras": {
        const w = get(op.tabla || "compras");
        if (!w || !w.table.columns.some(c => c.key === "revision")) { fail(i, "no hay tabla de compras con revisión."); break; }
        const casos = Array.isArray(op.casos) ? op.casos.map(fold) : [];
        const productos = Array.isArray(op.productos) ? op.productos.map(fold).filter(Boolean) : [];
        const proveedor = op.proveedor ? fold(op.proveedor) : "";
        const adjust = op.ajustes && typeof op.ajustes === "object" ? op.ajustes : null;
        if (adjust && !productos.length) { fail(i, "para corregir a mano indica «productos» (los nombres tal como aparecen en compras)."); break; }
        const n = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const c = coerce(v, "decimal"); return c.ok && typeof c.value === "number" && c.value > 0 ? c.value : null; };
        if (adjust && [adjust.contenido, adjust.precio_final, adjust.descuento_pct].every(v => n(v) === null)) { fail(i, "«ajustes» necesita contenido, precio_final o descuento_pct."); break; }
        const rows = w.table.rows.filter(r => {
          if (typeof r._id !== "string" || r._review === "revisada" && !adjust) return false;
          if (!adjust && r._review !== "corregible" && r._review !== "regalo") return false;
          if (casos.length && !casos.includes(fold(r._review_caso))) return false;
          if (proveedor && !fold(r.proveedor).includes(proveedor)) return false;
          if (productos.length && !productos.some(p => fold(r.producto) === p || fold(r.producto).includes(p))) return false;
          return true;
        });
        if (!rows.length) { fail(i, "ninguna compra coincide (revisa «casos», «productos» y «proveedor»; las ya revisadas no se repiten)."); break; }
        if (rows.length > MAX_ROWS_PER_OP) { fail(i, `son ${rows.length} compras; el máximo es ${MAX_ROWS_PER_OP}.`); break; }
        const num = (v: CellValue) => typeof v === "number" ? v : null;
        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        const counts = new Map<string, number>();
        for (const r of rows) {
          let valores: ReviewValues;
          if (adjust) {
            const importe = num(r.importe), cantidad = num(r.cantidad);
            const contenido = n(adjust.contenido), fijo = n(adjust.precio_final), pct = n(adjust.descuento_pct);
            const unidad = adjust.unidad ?? (typeof r.unidad_real === "string" ? r.unidad_real : null);
            let real = num(r.cantidad_real);
            if (fijo && importe !== null) real = r4(importe / fijo);
            else if (contenido && cantidad !== null) real = r4(cantidad * contenido);
            const final = fijo ?? (real && importe !== null ? r4(importe / real) : num(r.precio_final));
            valores = { caso: String(r._review_caso ?? "duda"), unidades: cantidad, cantidad_real: real, unidad_real: unidad, descuento_pct: pct ?? num(r.descuento_pct),
              precio_final: final, ahorro: num(r.ahorro), nota: String(adjust.nota ?? (fijo ? `Precio final fijado: ${fijo.toLocaleString("es-ES")} €${unidad ? `/${unidad}` : ""}.` : contenido ? `Contenido por unidad: ${contenido.toLocaleString("es-ES")}${unidad ? ` ${unidad}` : ""}.` : "Corregido.")).slice(0, 300) };
          } else {
            valores = { caso: String(r._review_caso), unidades: null, cantidad_real: num(r.cantidad_real), unidad_real: typeof r.unidad_real === "string" ? r.unidad_real : null,
              descuento_pct: num(r.descuento_pct), precio_final: num(r.precio_final), ahorro: num(r.ahorro), nota: String(r._review_nota ?? "") };
          }
          acciones.push({ k: "revision", tabla: w.table.key, ref: r._id as string, valores });
          Object.assign(r, { cantidad_real: valores.cantidad_real, unidad_real: valores.unidad_real, descuento_pct: valores.descuento_pct, precio_final: valores.precio_final, revision: "Revisada", _review: "revisada" });
          const label = adjust ? "corregidas a mano" : r._review_caso === "regalo" ? "regalos" : "correcciones";
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        cifras.filas_cambiadas += rows.length;
        const shown = ["producto", "proveedor", "cantidad", "importe", "cantidad_real", "unidad_real", "descuento_pct", "precio_final", "revision"];
        pasos.push({ texto: `Guardar la revisión de ${plural(rows.length, "compra", "compras")} de ${label(w)} (${[...counts].map(([k, v]) => `${v.toLocaleString("es-ES")} ${k}`).join(", ")}). Lo leído en las facturas no se toca.`,
          avisos: [], muestra: { columnas: w.table.columns.filter(c => shown.includes(c.key)).map(c => ({ key: c.key, label: c.label, kind: c.kind })),
            filas: rows.slice(0, SAMPLE).map(r => Object.fromEntries(shown.map(k => [k, r[k] ?? null]))) } });
        break;
      }
      default: fail(i, `operación desconocida «${(op as { op?: string }).op}».`);
    }
    if (acciones.length > MAX_ACTIONS) { fail(i, "la propuesta es demasiado grande: divídela en varias."); break; }
  }
  if (!operations?.length) errores.push("La propuesta no tiene operaciones.");
  // What the person will have to fill in, in the tables this proposal touches.
  const touchedTables = new Set(acciones.map(a => a.tabla));
  const pendientes: Pending[] = [];
  for (const key of touchedTables) {
    const w = work.get(key);
    if (!w) continue;
    for (const c of w.table.columns.filter(c => c.completar)) {
      const empty = w.table.rows.filter(r => r[c.key] === null || r[c.key] === undefined || r[c.key] === "").length;
      if (empty) pendientes.push({ tabla: key, nombreTabla: w.table.label, columna: c.key, nombreColumna: c.label, filas: empty });
    }
  }
  return { ok: !errores.length, errores, pasos, acciones, cifras, pendientes };
}
