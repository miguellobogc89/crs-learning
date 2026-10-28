import type { CellValue, Column, Table } from "@/lib/analytics/compute";

/**
 * What the assistant can ask of the workspace's tables (the same ones Analítica shows): filter, cross two tables,
 * group, add up and sort. Read-only and pure — tables in, a small result out — so it can be tested without a database
 * and can never write anything. No SQL is generated: the model only fills a structured query.
 *
 * Column references: a column of the main table by its key ("total"); a column of the crossed table as
 * "<tabla>.<key>" ("empresas.nif"); a date by month/quarter/year as "<columna>:mes" | ":trimestre" | ":año".
 */
export type FilterOp = "=" | "!=" | "contiene" | "no_contiene" | ">" | ">=" | "<" | "<=" | "entre" | "en" | "vacio" | "no_vacio";
export type Filter = { columna: string; op: FilterOp; valor?: string | number | boolean | null; valores?: (string | number)[] };
export type AggregateFn = "suma" | "media" | "cuenta" | "cuenta_distintos" | "min" | "max" | "ultimo" | "primero";
/** A column computed row by row: a op b (b another column or a fixed value). E.g. cantidad × precio. */
export type Formula = { nombre: string; a: string; op: "+" | "-" | "*" | "/"; b?: string; valor?: number; importe?: boolean };
export type Query = {
  tabla: string;
  /** One table or several in a chain; a later one can join on a column of an earlier one ("equivalencias.producto"). */
  cruzar?: Join | Join[];
  filtros?: Filter[];
  agrupar_por?: string[];
  formulas?: Formula[];
  /** "ultimo"/"primero": the value of `columna` in the row with the latest/earliest `segun` (a date). */
  calcular?: { funcion: AggregateFn; columna?: string; nombre?: string; segun?: string }[];
  columnas?: string[];
  ordenar?: { columna: string; direccion?: "asc" | "desc" }[];
  limite?: number;
};
/** columna_otra may be omitted when columna_local is a link to that table: rows are matched by the link itself. */
export type Join = { tabla: string; columna_local: string; columna_otra?: string; tipo?: "interior" | "izquierda" };
export type ResultColumn = { key: string; label: string; kind?: Column["kind"] };
export type QueryResult = { columnas: ResultColumn[]; filas: Record<string, CellValue>[]; total: number; truncado: boolean; tablas: string[] };
export class QueryError extends Error {}

export const MAX_LIMIT = 500;
const MAX_JOINED = 50_000;
const DATE_PARTS = { mes: "Mes", trimestre: "Trimestre", "año": "Año" } as const;
type DatePart = keyof typeof DATE_PARTS;

const fold = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const empty = (v: CellValue | undefined) => v === null || v === undefined || v === "";
/** Columns the assistant sees: no internal fields (_id…) and no links to files. */
export const visibleColumns = (t: Table) => t.columns.filter(c => !c.key.startsWith("_") && c.kind !== "document");

/** Short description of every table for the model: columns, kinds, rows and a few real values of the repeated ones. */
export function catalog(tables: Table[], editable: Set<string> = new Set()) {
  return tables.map(t => {
    const cols = visibleColumns(t);
    return {
      tabla: t.key, nombre: t.label, descripcion: t.description, filas: t.rows.length,
      ...(t.title ? { nombra_filas: t.title } : {}), ...(editable.has(t.key) ? { creada_con_asistente: true } : {}),
      columnas: cols.map(c => {
        const sample = c.filter || (!c.kind || c.kind === "text")
          ? [...new Set(t.rows.map(r => r[c.key]).filter(v => typeof v === "string" && v))].slice(0, c.filter ? 8 : 3) as string[] : undefined;
        return { columna: c.key, nombre: c.label, tipo: c.link ? "enlace" : c.kind ?? "text", ...(c.link ? { enlaza_con: c.link } : {}), ...(sample?.length ? { ejemplos: sample } : {}) };
      }),
    };
  });
}

type Resolved = { key: string; label: string; kind?: Column["kind"]; link?: string; get: (r: Record<string, CellValue>) => CellValue; getId?: (r: Record<string, CellValue>) => CellValue };

function datePart(value: CellValue, part: DatePart): CellValue {
  if (typeof value !== "string" || !/^\d{4}-\d{2}/.test(value)) return null;
  const [y, m] = [value.slice(0, 4), Number(value.slice(5, 7))];
  return part === "año" ? y : part === "mes" ? `${y}-${String(m).padStart(2, "0")}` : `${y}-T${Math.ceil(m / 3)}`;
}

/** `maxLimit` lets internal callers (changes from a query) go beyond the chat limit; `keepIds` keeps each row's `_id`. */
export function runQuery(tables: Table[], q: Query, opts: { maxLimit?: number; keepIds?: boolean } = {}): QueryResult {
  const main = tables.find(t => t.key === q.tabla);
  if (!main) throw new QueryError(`No existe la tabla «${q.tabla}». Tablas: ${tables.map(t => t.key).join(", ")}`);
  const joins = (Array.isArray(q.cruzar) ? q.cruzar : q.cruzar ? [q.cruzar] : []).slice(0, 4);
  const others: Table[] = [];
  for (const j of joins) {
    const t = tables.find(x => x.key === j?.tabla);
    if (!t) throw new QueryError(`No existe la tabla «${j?.tabla}» para cruzar.`);
    if (t.key === main.key || others.some(o => o.key === t.key)) throw new QueryError(`La tabla «${t.key}» ya está en la consulta: cada tabla se cruza una vez.`);
    others.push(t);
  }

  // Every column a query can name: the main table's, and those of the crossed tables (prefixed), plus date parts.
  const base = new Map<string, Resolved>();
  for (const c of visibleColumns(main)) base.set(c.key, { key: c.key, label: c.label, kind: c.kind, link: c.link, get: r => r[c.key] ?? null,
    ...(c.link ? { getId: (r: Record<string, CellValue>) => r[`_link_${c.key}`] ?? null } : {}) });
  const addColumns = (other: Table) => {
    for (const c of visibleColumns(other)) {
      const key = `${other.key}.${c.key}`;
      base.set(key, { key, label: `${c.label} (${other.label})`, kind: c.kind, link: c.link, get: r => r[key] ?? null,
        ...(c.link ? { getId: (r: Record<string, CellValue>) => r[`${other.key}._link_${c.key}`] ?? null } : {}) });
    }
  };
  const column = (ref: string): Resolved => {
    // Only a trailing :mes / :trimestre / :año is a date part (table keys also contain ":", e.g. "tabla:catalogo.precio").
    const dp = /:(mes|trimestre|año|[a-zñ]+)$/.exec(ref);
    const isPart = !!dp && !base.has(ref) && !ref.slice(0, dp.index).endsWith(".") && (dp[1] in DATE_PARTS || base.has(ref.slice(0, dp.index)));
    const raw = isPart ? ref.slice(0, dp!.index) : ref;
    const part = isPart ? dp![1] : undefined;
    // "facturas.total" on the main table is just "total".
    const name = raw.startsWith(`${main.key}.`) && !base.has(raw) ? raw.slice(main.key.length + 1) : raw;
    const col = base.get(name);
    if (!col) throw new QueryError(`No existe la columna «${name}». Columnas: ${[...base.keys()].join(", ")}`);
    if (!part) return col;
    if (!(part in DATE_PARTS) || col.kind !== "date") throw new QueryError(`«${ref}»: solo las fechas admiten :mes, :trimestre o :año.`);
    return { key: ref, label: `${DATE_PARTS[part as DatePart]} (${col.label})`, kind: "text", get: r => datePart(col.get(r), part as DatePart) };
  };

  // Rows, crossed in order: each crossed table's values travel prefixed with its key (and its ids, to follow links).
  let rows: Record<string, CellValue>[] = main.rows;
  for (const [n, j] of joins.entries()) {
    const other = others[n];
    const local = column(j.columna_local);
    const byLink = local.link === other.key && !!local.getId;
    const remote = byLink ? undefined : visibleColumns(other).find(c => c.key === j.columna_otra);
    if (!byLink && !remote) throw new QueryError(`La tabla «${other.key}» no tiene la columna «${j.columna_otra ?? ""}»${local.link ? ` (o cruza por el enlace «${j.columna_local}», que apunta a «${local.link}»)` : ""}.`);
    const index = new Map<string, Record<string, CellValue>[]>();
    for (const r of other.rows) {
      const k = byLink ? (typeof r._id === "string" ? r._id : "") : fold(r[remote!.key]);
      if (k) index.set(k, [...(index.get(k) ?? []), r]);
    }
    const linkCols = visibleColumns(other).filter(c => c.link);
    const prefixed = (r: Record<string, CellValue> | null) => ({
      ...Object.fromEntries(visibleColumns(other).map(c => [`${other.key}.${c.key}`, r ? r[c.key] ?? null : null])),
      [`${other.key}._id`]: r ? r._id ?? null : null,
      ...Object.fromEntries(linkCols.map(c => [`${other.key}._link_${c.key}`, r ? r[`_link_${c.key}`] ?? null : null])),
    });
    const out: Record<string, CellValue>[] = [];
    for (const r of rows) {
      const key = byLink ? String(local.getId!(r) ?? "") : fold(local.get(r));
      const matches = key ? index.get(key) ?? [] : [];
      if (!matches.length) { if (j.tipo === "izquierda") out.push({ ...r, ...prefixed(null) }); continue; }
      for (const m of matches) out.push({ ...r, ...prefixed(m) });
      if (out.length > MAX_JOINED) throw new QueryError("El cruce da demasiadas filas: filtra antes o cruza por una columna más concreta.");
    }
    rows = out;
    addColumns(other);
  }

  // Formulas: new columns computed on each row (after crossing, so they can mix both tables).
  for (const f of q.formulas ?? []) {
    const name = String(f.nombre ?? "").trim();
    if (!name || base.has(name)) throw new QueryError(`La fórmula necesita un nombre nuevo («${name}» no vale).`);
    const a = column(f.a), b = f.b !== undefined ? column(f.b) : undefined;
    if (!b && typeof f.valor !== "number") throw new QueryError(`La fórmula «${name}» necesita «b» (otra columna) o «valor».`);
    const isNum = (c: Resolved) => c.kind === "money" || c.kind === "number";
    if (!isNum(a) || (b && !isNum(b))) throw new QueryError(`La fórmula «${name}» solo opera con importes o números.`);
    const money = f.importe ?? (a.kind === "money" || b?.kind === "money");
    const calc = (x: number, y: number) => f.op === "+" ? x + y : f.op === "-" ? x - y : f.op === "*" ? x * y : y === 0 ? null : x / y;
    if (!["+", "-", "*", "/"].includes(f.op)) throw new QueryError(`Operador de fórmula no válido «${f.op}».`);
    rows = rows.map(r => {
      const x = a.get(r), y = b ? b.get(r) : f.valor!;
      const v = typeof x === "number" && typeof y === "number" ? calc(x, y) : null;
      return { ...r, [`=${name}`]: v === null ? null : Math.round(v * 10000) / 10000 };
    });
    base.set(name, { key: name, label: name, kind: money ? "money" : "number", get: r => r[`=${name}`] ?? null });
  }

  for (const f of q.filtros ?? []) {
    const c = column(f.columna);
    rows = rows.filter(r => matches(c.get(r), f, c.kind));
  }

  let columns: ResultColumn[];
  let result: Record<string, CellValue>[];
  if (q.agrupar_por?.length || q.calcular?.length) {
    const keys = (q.agrupar_por ?? []).map(column);
    const used = new Set(keys.map(k => k.key));
    const aggs = (q.calcular?.length ? q.calcular : [{ funcion: "cuenta" as const }]).map((a, i) => {
      const c = a.columna ? column(a.columna) : undefined;
      if (a.funcion !== "cuenta" && !c) throw new QueryError(`«${a.funcion}» necesita una columna.`);
      const by = a.funcion === "ultimo" || a.funcion === "primero" ? (a.segun ? column(a.segun) : undefined) : undefined;
      if ((a.funcion === "ultimo" || a.funcion === "primero") && !by) throw new QueryError(`«${a.funcion}» necesita «segun» (una columna de fecha).`);
      if ((a.funcion === "suma" || a.funcion === "media") && c && c.kind !== "money" && c.kind !== "number") throw new QueryError(`«${a.funcion}» solo vale para importes o números («${c.label}» no lo es).`);
      const verb = { suma: "Suma", media: "Media", cuenta: "Nº de filas", cuenta_distintos: "Distintos", min: "Mínimo", max: "Máximo", ultimo: "Último", primero: "Primero" }[a.funcion];
      let key = a.nombre?.trim() || (c ? `${a.funcion}_${c.key}` : "cuenta");
      while (used.has(key)) key = `${key}_${i + 1}`;
      used.add(key);
      const kind: Column["kind"] = a.funcion === "cuenta" || a.funcion === "cuenta_distintos" ? "number" : c?.kind;
      return { ...a, c, by, key, label: a.nombre?.trim() || (c ? `${verb} de ${c.label.toLowerCase()}` : verb), kind };
    });
    const groups = new Map<string, Record<string, CellValue>[]>();
    for (const r of rows) { const k = JSON.stringify(keys.map(k => k.get(r))); groups.set(k, [...(groups.get(k) ?? []), r]); }
    if (!keys.length && !groups.size) groups.set("[]", []);
    result = [...groups].map(([k, members]) => {
      const values = JSON.parse(k) as CellValue[];
      const row: Record<string, CellValue> = Object.fromEntries(keys.map((c, i) => [c.key, values[i]]));
      for (const a of aggs) row[a.key] = aggregate(members, a.funcion, a.c, a.by);
      return row;
    });
    columns = [...keys.map(({ key, label, kind }) => ({ key, label, kind })), ...aggs.map(({ key, label, kind }) => ({ key, label, kind }))];
    // Default order: the first figure, biggest first.
    if (!q.ordenar?.length && aggs.length) result.sort((a, b) => num(b[aggs[0].key]) - num(a[aggs[0].key]));
  } else {
    const chosen = (q.columnas?.length ? q.columnas : visibleColumns(main).map(c => c.key)).map(column);
    result = rows.map(r => ({ ...(opts.keepIds ? { _id: r._id ?? null } : {}), ...Object.fromEntries(chosen.map(c => [c.key, c.get(r)])) }));
    columns = chosen.map(({ key, label, kind }) => ({ key, label, kind }));
  }

  for (const o of [...(q.ordenar ?? [])].reverse()) {
    if (!columns.some(c => c.key === o.columna)) throw new QueryError(`Para ordenar por «${o.columna}» tiene que estar en el resultado (${columns.map(c => c.key).join(", ")}).`);
    const dir = o.direccion === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => compare(a[o.columna], b[o.columna]) * dir);
  }
  const limit = Math.min(Math.max(1, Math.floor(q.limite ?? 50)), opts.maxLimit ?? MAX_LIMIT);
  return { columnas: columns, filas: result.slice(0, limit), total: result.length, truncado: result.length > limit, tablas: [main.key, ...others.map(o => o.key)] };
}

const num = (v: CellValue | undefined) => typeof v === "number" ? v : Number.NEGATIVE_INFINITY;
function compare(a: CellValue | undefined, b: CellValue | undefined) {
  if (empty(a) || empty(b)) return empty(a) && empty(b) ? 0 : empty(a) ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

function toNumber(v: unknown) { const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; }

function matches(value: CellValue, f: Filter, kind?: Column["kind"]): boolean {
  const numeric = kind === "money" || kind === "number";
  const cmp = (target: unknown) => {
    if (numeric) { const a = typeof value === "number" ? value : null, b = toNumber(target); return a === null || b === null ? null : a - b; }
    if (empty(value)) return null;
    return String(value).localeCompare(String(target), "es", { numeric: true, sensitivity: "base" });
  };
  switch (f.op) {
    case "vacio": return empty(value);
    case "no_vacio": return !empty(value);
    case "=": return typeof value === "boolean" ? value === (f.valor === true || fold(f.valor) === "si" || fold(f.valor) === "true") : numeric ? cmp(f.valor) === 0 : fold(value) === fold(f.valor);
    case "!=": return typeof value === "boolean" ? value !== (f.valor === true || fold(f.valor) === "si" || fold(f.valor) === "true") : numeric ? cmp(f.valor) !== 0 : fold(value) !== fold(f.valor);
    case "contiene": return fold(value).includes(fold(f.valor));
    case "no_contiene": return !fold(value).includes(fold(f.valor));
    case "en": return (f.valores ?? []).some(v => numeric ? cmp(v) === 0 : fold(value) === fold(v));
    case ">": { const c = cmp(f.valor); return c !== null && c > 0; }
    case ">=": { const c = cmp(f.valor); return c !== null && c >= 0; }
    case "<": { const c = cmp(f.valor); return c !== null && c < 0; }
    case "<=": { const c = cmp(f.valor); return c !== null && c <= 0; }
    case "entre": {
      const [lo, hi] = f.valores ?? [];
      const a = cmp(lo), b = cmp(hi);
      return a !== null && b !== null && a >= 0 && b <= 0;
    }
    default: throw new QueryError(`Operador desconocido «${(f as Filter).op}».`);
  }
}

function aggregate(rows: Record<string, CellValue>[], fn: AggregateFn, c?: Resolved, by?: Resolved): CellValue {
  if (fn === "ultimo" || fn === "primero") {
    const dated = rows.filter(r => !empty(by!.get(r)) && !empty(c!.get(r)));
    if (!dated.length) return null;
    const pick = dated.reduce((best, r) => { const d = compare(by!.get(r), by!.get(best)); return fn === "ultimo" ? (d > 0 ? r : best) : (d < 0 ? r : best); });
    return c!.get(pick);
  }
  if (fn === "cuenta") return c ? rows.filter(r => !empty(c.get(r))).length : rows.length;
  const values = rows.map(r => c!.get(r)).filter(v => !empty(v));
  if (fn === "cuenta_distintos") return new Set(values.map(v => fold(v))).size;
  if (fn === "suma" || fn === "media") {
    const nums = values.filter((v): v is number => typeof v === "number");
    if (!nums.length) return null;
    const sum = Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100;
    return fn === "suma" ? sum : Math.round((sum / nums.length) * 100) / 100;
  }
  if (!values.length) return null;
  return values.reduce((best, v) => (fn === "min" ? compare(v, best) < 0 : compare(v, best) > 0) ? v : best);
}
