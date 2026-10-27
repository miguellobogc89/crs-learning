import type { Page } from "../extractor/contract";
import type { TargetedFile } from "../targeted/contract";
import { verifyPage } from "./compare";
import { VERIFIER_REVISION, type FileReference, type Severity } from "./contract";
import { FIELD_SETS, type EntityDef } from "../targets/field-sets";

/**
 * Verification of a TARGETED extraction: every extracted value must appear in the base reading of the page it
 * cites (exactly, or it is reported with what the document says there). Only extracted values are checked, so
 * footers, logos and legal text that were never extracted produce no noise.
 */
export type ValueFinding = { parte: string; campo: string; valor: string; pagina: number | null; estado: "distinto" | "no_encontrado";
  documento?: string; diferencias?: { modelo: string; documento: string }[]; severidad: Severity };
export type FileValueReport = { archivoId: string; archivo: string; comprobados: number; hallazgos: ValueFinding[];
  faltan: { parte: string; campo: string }[]; avisos: string[] };
export type ValuesSummary = { comprobados: number; distintos: number; noEncontrados: number; faltan: number; probablesErrores: number; aRevisar: number };
export type ValuesReport = { module: "reading_verifier"; version: typeof VERIFIER_REVISION; modo: "valores"; loteId: string;
  lecturaModificada: false; resumen: ValuesSummary; archivos: FileValueReport[] };

// Fields whose value is a classification, not printed text ("sin_impuestos", yes/no): never searched in the document.
const NOT_LITERAL = new Set<string>();
const collect = (entities: EntityDef[]) => entities.forEach(e => { e.fields.forEach(f => { if (f.type === "enum" || f.type === "boolean") NOT_LITERAL.add(`${e.role}.${f.key}`); });
  if (e.children) collect(e.children); });
FIELD_SETS.forEach(set => collect(set.entities));

type Item = { parte: string; campo: string; valor: string; pagina: number | null; paginas: number[] };
type Finding = ReturnType<typeof verifyPage>["literales"][number];

function items(file: TargetedFile): Item[] {
  return file.partes.filter(p => p.modo === "dirigida" && p.entidades).flatMap(p => Object.entries(p.entidades!).flatMap(([role, data]) =>
    (Array.isArray(data) ? data.map((r, i) => [`${role}[${i + 1}]`, r] as const) : [[role, data] as const]).flatMap(([label, record]) =>
      Object.entries(record).filter(([key, v]) => v.valor !== null && !NOT_LITERAL.has(`${role}.${key}`)).map(([key, v]): Item =>
        ({ parte: p.parteId, campo: `${label}.${key}`, valor: v.valor!, pagina: v.pagina, paginas: p.paginas })))));
}

/** Checks a set of values against one page: each value is one block of a synthetic page fed to the comparator. */
function checkOnPage(values: Item[], reference: FileReference["paginas"][number]) {
  const page: Page = { numero: reference.numero, incidencias: [], bloques: values.map(v => ({ tipo: "texto" as const, texto: v.valor })) };
  const report = verifyPage(page, reference);
  const byBlock = new Map<number, Finding[]>();
  for (const finding of report.literales) {
    const block = Number(/^bloque (\d+)/.exec(finding.donde)?.[1]);
    byBlock.set(block, [...(byBlock.get(block) ?? []), finding]);
  }
  return { byBlock, avisos: report.avisos.filter(a => /símbolo dibujado/.test(a)), source: reference.fuente };
}

// A field value is extracted without the punctuation around it in the document ("A-82018474" from "CIF. A-82018474.",
// "21.00 %" from "(21.00 %)", "Madrid" from "Madrid,"). Leading "-" is never ignored: it may be a negative sign.
const LEADING = /^[(\[¿¡"'«“.,:;]+/u;
const TRAILING = /[)\]"'»”.,:;\-–—]+$/u;
const edges = (text: string) => text.replace(LEADING, "").replace(TRAILING, "");
const compact = (text: string) => text.replace(/\s+/g, "");
function onlyEdgePunctuation(valor: string, findings: Finding[]) {
  return findings.every(f => {
    if (f.estado !== "distinto") return false;
    if (f.documento !== undefined && compact(edges(f.documento)) === compact(valor)) return true;
    // Word-level differences only ("Madrid" vs "Madrid,"): the model's word is whole and the document adds edge punctuation.
    return !!f.diferencias?.length && f.diferencias.every(d => d.modelo !== "" && edges(d.modelo) === d.modelo && edges(d.documento) === d.modelo);
  });
}

// A worded value printed glued to other text by punctuation ("REAL" in "30/11/2025(REAL)") is present. Only values
// with letters and at least three characters: digits inside numbers ("1" in "1,5") never count, nor "_"-joined words.
function insideGluedToken(item: Item, reference: FileReference | undefined) {
  const value = item.valor.trim();
  if (!reference || value.length < 3 || !/\p{L}/u.test(value) || /\s/.test(value)) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "u");
  const pages = item.pagina !== null ? [item.pagina] : item.paginas;
  return reference.paginas.some(p => pages.includes(p.numero) && p.palabras.some(w => w.t !== value && pattern.test(w.t)));
}

export function verifyTargetedFile(file: TargetedFile, reference: FileReference | undefined): FileValueReport {
  const out: FileValueReport = { archivoId: file.archivoId, archivo: file.archivo, comprobados: 0, hallazgos: [],
    faltan: file.partes.flatMap(p => (p.faltan ?? []).map(campo => ({ parte: p.parteId, campo }))), avisos: [] };
  const all = items(file);
  out.comprobados = all.length;
  if (!all.length) return out;
  if (!reference) { out.avisos.push("Sin lectura base posicionada (formato no PDF): valores no comprobados"); return out; }
  const pageRef = (n: number) => reference.paginas.find(p => p.numero === n);
  // Values with a cited page are checked there; values without one, on every page of their part (found anywhere = ok).
  const cited = new Map<number, Item[]>();
  for (const v of all) if (v.pagina !== null) cited.set(v.pagina, [...(cited.get(v.pagina) ?? []), v]);
  const pending: { item: Item; findings: Finding[]; source: string }[] = [];
  for (const [n, values] of cited) {
    const ref = pageRef(n);
    if (!ref || ref.fuente === "sin_referencia") { out.avisos.push(`Página ${n} sin lectura base: ${values.length} valor(es) no comprobados`); continue; }
    const { byBlock, avisos, source } = checkOnPage(values, ref);
    out.avisos.push(...avisos);
    values.forEach((v, i) => { const f = byBlock.get(i + 1); if (f?.length) pending.push({ item: v, findings: f, source }); });
  }
  for (const v of all.filter(x => x.pagina === null)) {
    let best: (typeof pending)[number] | null = null;
    for (const n of v.paginas) {
      const ref = pageRef(n);
      if (!ref || ref.fuente === "sin_referencia") continue;
      const { byBlock, source } = checkOnPage([v], ref);
      const f = byBlock.get(1);
      if (!f?.length) { best = null; break; }
      if (!best || (best.findings[0].estado === "no_encontrado" && f[0].estado === "distinto")) best = { item: v, findings: f, source };
    }
    if (best) pending.push(best);
  }
  for (const { item, findings } of pending.filter(p => !onlyEdgePunctuation(p.item.valor, p.findings) && !(p.findings.every(f => f.estado === "no_encontrado") && insideGluedToken(p.item, reference)))) {
    // A multi-line value yields one finding per line: the value is reported once, with its first difference.
    const [first] = findings;
    out.hallazgos.push({ parte: item.parte, campo: item.campo, valor: item.valor, pagina: item.pagina, estado: first.estado,
      ...(first.documento !== undefined ? { documento: first.documento } : {}), ...(first.diferencias ? { diferencias: first.diferencias } : {}),
      severidad: findings.some(f => f.severidad === "probable_error") ? "probable_error" : "revisar" });
  }
  return out;
}

export function valuesReport(loteId: string, archivos: FileValueReport[]): ValuesReport {
  const findings = archivos.flatMap(a => a.hallazgos);
  return { module: "reading_verifier", version: VERIFIER_REVISION, modo: "valores", loteId, lecturaModificada: false, archivos,
    resumen: { comprobados: archivos.reduce((n, a) => n + a.comprobados, 0), distintos: findings.filter(f => f.estado === "distinto").length,
      noEncontrados: findings.filter(f => f.estado === "no_encontrado").length, faltan: archivos.reduce((n, a) => n + a.faltan.length, 0),
      probablesErrores: findings.filter(f => f.severidad === "probable_error").length, aRevisar: findings.filter(f => f.severidad === "revisar").length } };
}
