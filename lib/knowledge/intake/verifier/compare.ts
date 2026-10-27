import type { Page, TableBlock } from "../extractor/contract";
import type { ColumnFinding, LiteralFinding, PageReference, PageReport, RefWord, Severity } from "./contract";

/**
 * Pure comparison of one extracted page against its independent reference reading.
 * It never changes values or guesses corrections: it only reports where the extraction
 * and the document disagree.
 */

/** Vertical tolerance (fraction of page height) when matching a cell inside its row band. */
const BAND_TOLERANCE = 0.003;
/** A cell is reported in another column only if it is clearly closer to it (fraction of page width). */
const COLUMN_MARGIN = 0.007;
/** Max vertical distance (fraction of page height) between consecutive words of one value: same or next line. */
const LINE_STEP = 0.03;
/** How far below the previous row the next row of a table is searched first (fraction of page height). */
const NEXT_ROW_WINDOW = 0.08;
/** OCR sometimes returns look-alike letters of other alphabets ("Pб" for "P6"); compare them as what they look like. */
const HOMOGLYPHS: Record<string, string> = { "б": "6", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X",
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "Α": "A", "Β": "B", "Ε": "E", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Χ": "X", "ο": "o" };
const NUMERIC = /^[€$£]?\s*[+−-]?\d[\d.,]*\s*[€$£%]?$/u;
const LETTER = /\p{L}/u;

type Box = { x0: number; y0: number; x1: number; y1: number };
type Band = [number, number] | null;
type Span = [number, number];

const squash = (value: string) => value.replace(/\s+/gu, "");

class ReferenceStream {
  readonly s: string;
  readonly owner: number[] = [];
  readonly used: boolean[];
  constructor(readonly words: RefWord[]) {
    let s = "";
    words.forEach((word, index) => {
      const text = squash(word.t);
      s += text;
      for (let k = 0; k < text.length; k++) this.owner.push(index);
    });
    this.s = s;
    this.used = new Array(s.length).fill(false);
  }
  box(a: number, b: number): Box {
    const ids = [...new Set(this.owner.slice(a, b))].map(i => this.words[i]);
    return { x0: Math.min(...ids.map(w => w.x0)), x1: Math.max(...ids.map(w => w.x1)), y0: Math.min(...ids.map(w => w.y0)), y1: Math.max(...ids.map(w => w.y1)) };
  }
  free(a: number, b: number) { return !this.used.slice(a, b).some(Boolean); }
  mark(a: number, b: number) { for (let k = a; k < b; k++) this.used[k] = true; }
  /** Starts and ends on a word boundary of the reference ("12,000" must not match inside "12,0000"). */
  whole(a: number, b: number) {
    return (a === 0 || this.owner[a - 1] !== this.owner[a]) && (b === this.s.length || this.owner[b] !== this.owner[b - 1]);
  }
  occurrences(value: string): Span[] {
    const result: Span[] = [];
    if (!value) return result;
    for (let i = this.s.indexOf(value); i >= 0; i = this.s.indexOf(value, i + 1)) {
      if (this.whole(i, i + value.length)) result.push([i, i + value.length]);
    }
    return result;
  }
}

/** Approximate substring alignment (Sellers): the substring of text with minimal edit distance to pattern. */
export function fuzzySubstring(pattern: string, text: string): { start: number; end: number; distance: number } {
  const n = text.length;
  let prev = new Array<number>(n + 1).fill(0);
  let startPrev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= pattern.length; i++) {
    const cur = new Array<number>(n + 1).fill(0);
    const startCur = new Array<number>(n + 1).fill(0);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const sub = prev[j - 1] + (pattern[i - 1] === text[j - 1] ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const best = Math.min(sub, del, ins);
      cur[j] = best;
      startCur[j] = best === sub ? startPrev[j - 1] : best === del ? startPrev[j] : startCur[j - 1];
    }
    prev = cur;
    startPrev = startCur;
  }
  let end = 0;
  for (let j = 1; j <= n; j++) if (prev[j] < prev[end]) end = j;
  return { start: startPrev[end], end, distance: prev[end] };
}

/** Character-level differences, as short pairs: what the extraction says vs what the document says. */
export function describeDifferences(model: string, document: string) {
  // LCS table is small: values are cells or single lines.
  const m = model.length, n = document.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    dp[i][j] = model[i] === document[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: { modelo: string; documento: string }[] = [];
  let i = 0, j = 0, a = "", b = "";
  const flush = () => { if (a || b) out.push({ modelo: a, documento: b }); a = ""; b = ""; };
  while (i < m || j < n) {
    if (i < m && j < n && model[i] === document[j]) { flush(); i++; j++; }
    else if (j < n && (i === m || dp[i][j + 1] >= dp[i + 1][j])) b += document[j++];
    else a += model[i++];
  }
  flush();
  return out;
}

export function verifyPage(page: Page, reference: PageReference): PageReport {
  const report: PageReport = { numero: page.numero, referencia: reference.fuente, literales: [], columnas: [], omisiones: [], avisos: [] };
  if (reference.fuente === "sin_referencia") {
    report.avisos.push(reference.aviso ?? "Página sin lectura independiente; no se ha verificado");
    return report;
  }
  const severity: Severity = reference.fuente === "capa_texto" ? "probable_error" : "revisar";
  const words = reference.fuente === "ocr"
    ? reference.palabras.map(w => ({ ...w, t: [...w.t].map(ch => HOMOGLYPHS[ch] ?? ch).join("") }))
    : reference.palabras;
  const st = new ReferenceStream(words);
  // Rotated text (e.g. a registry note printed vertically in the margin) spans many rows; it never belongs to a row band.
  const vertical = words.map(w => w.y1 - w.y0 > 0.02 && w.y1 - w.y0 > 2.5 * (w.x1 - w.x0));
  const inBand = ([a, b]: Span, band: Band) => {
    if (!band) return true;
    if (st.owner.slice(a, b).some(i => vertical[i])) return false;
    const box = st.box(a, b);
    return box.y1 >= band[0] - BAND_TOLERANCE && box.y0 <= band[1] + BAND_TOLERANCE;
  };
  const preferFree = (spans: Span[]) => spans.sort((x, y) => Number(!st.free(...x)) - Number(!st.free(...y)));
  const midY = (span: Span) => { const box = st.box(...span); return (box.y0 + box.y1) / 2; };
  const boxOf = (spans: Span[]) => st.box(Math.min(...spans.map(s => s[0])), Math.max(...spans.map(s => s[1])));

  /**
   * Words of one value, each found as a whole word and close to the previous one (same or next line).
   * Several starting points are tried so that a near-complete match in place is not traded for a far one.
   */
  function chain(tokens: string[], band: Band) {
    const candidates = (token: string) => st.occurrences(squash(token)).filter(o => inBand(o, band));
    let best: { spans: Span[]; missing: string[]; free: number } | null = null;
    const first = tokens.findIndex(token => candidates(token).length);
    if (first < 0) return { spans: [] as Span[], missing: tokens };
    for (const start of preferFree(candidates(tokens[first])).slice(0, 25)) {
      const spans: Span[] = [start];
      const missing = tokens.slice(0, first);
      for (const token of tokens.slice(first + 1)) {
        const prev = spans.at(-1)!;
        const found = candidates(token).filter(o => !spans.some(s => s[0] === o[0]) && Math.abs(midY(o) - midY(prev)) <= LINE_STEP).sort((x, y) =>
          Number(!st.free(...x)) - Number(!st.free(...y)) || Number(x[0] < prev[1]) - Number(y[0] < prev[1]) || Math.abs(x[0] - prev[1]) - Math.abs(y[0] - prev[1]));
        if (found.length) spans.push(found[0]); else missing.push(token);
      }
      const free = spans.filter(span => st.free(...span)).length;
      if (!best || spans.length > best.spans.length || (spans.length === best.spans.length && free > best.free)) best = { spans, missing, free };
      if (!missing.length && free === spans.length) break;
    }
    return best!;
  }

  type Attempt = { box: Box | null; spans: Span[]; finding?: LiteralFinding; aviso?: string };
  /** Searches without side effects; `commit` applies the result. Returns null when nothing usable is found. */
  function attempt(value: string, where: string, band: Band): Attempt | null {
    const v = squash(value);
    // 1. exact, on word boundaries, in text not yet matched to another value
    const exact = st.occurrences(v).filter(o => inBand(o, band));
    const exactFree = exact.filter(o => st.free(...o));
    if (exactFree.length) return { box: st.box(...exactFree[0]), spans: [exactFree[0]] };
    // 2. every word present, close together, but separated by the reference's reading order
    const tokens = value.split(/\s+/u).filter(Boolean);
    const { spans, missing } = chain(tokens, band);
    if (tokens.length > 1 && !missing.length && spans.every(span => st.free(...span))) return { box: boxOf(spans), spans };
    // 2a. only text already matched to another value: the document prints it once, the reading repeats it
    if (exact.length) return { box: st.box(...exact[0]), spans: [exact[0]] };
    if (tokens.length > 1 && !missing.length) return { box: boxOf(spans), spans };
    if (!/[\p{L}\p{N}]/u.test(v)) {
      // Drawn marks (radio buttons, ticks, bullets) are graphics, not text: they cannot be checked against a text reading.
      return { box: null, spans: [], aviso: `${where}: «${value}» no aparece como texto en el documento (puede ser un símbolo dibujado)` };
    }
    // 2b. long sentence with a few differing words: report the words, which is what a reader can check
    if (tokens.length >= 4 && missing.length <= tokens.length / 2) {
      const extra: Span[] = [];
      const diferencias = missing.map(token => {
        // Very short words ("se", "Nº") have no meaningful closest match: report them as absent.
        if (squash(token).length < 4) return { modelo: token, documento: "" };
        const { start, end, distance } = fuzzySubstring(squash(token), st.s);
        if (end <= start || distance > Math.max(1, Math.floor(token.length / 2))) return { modelo: token, documento: "" };
        let s0 = start, s1 = end;
        while (s0 > 0 && st.owner[s0 - 1] === st.owner[s0]) s0--;
        while (s1 < st.s.length && st.owner[s1] === st.owner[s1 - 1]) s1++;
        extra.push([s0, s1]);
        return { modelo: token, documento: st.s.slice(s0, s1) };
      });
      return { box: spans.length ? boxOf(spans) : null, spans: [...spans, ...extra],
        finding: { donde: where, modelo: value, severidad: severity, estado: "distinto", diferencias } };
    }
    // 3. approximate. Not for very short values: "2" inside "0,7200" or "10" against "3073" is not evidence of anything.
    if (v.length <= 3) return null;
    const all = Array.from({ length: st.s.length }, (_, k) => k).filter(k => !band || inBand([k, k + 1], band));
    const limit = Math.max(1, Math.floor(v.length / 3));
    const tryIn = (index: number[]) => {
      const region = index.map(k => st.s[k]).join("");
      const match = region ? fuzzySubstring(v, region) : { start: 0, end: 0, distance: v.length };
      return { index, region, ...match, ok: match.end > match.start && match.distance <= limit };
    };
    // Text not yet matched to another value first.
    let best = tryIn(all.filter(k => !st.used[k]));
    if (!best.ok) best = tryIn(all);
    if (!best.ok) return null;
    const { index, region, start, end } = best;
    let s0 = index[start], s1 = index[end - 1] + 1;
    while (s0 > 0 && st.owner[s0 - 1] === st.owner[s0]) s0--;
    while (s1 < st.s.length && st.owner[s1] === st.owner[s1 - 1]) s1++;
    const document = s1 - s0 <= end - start + 12 ? st.s.slice(s0, s1) : region.slice(start, end);
    return { box: st.box(index[start], index[end - 1] + 1), spans: index.slice(start, end).map(k => [k, k + 1] as Span),
      finding: { donde: where, modelo: value, severidad: severity, estado: "distinto", documento: document, diferencias: describeDifferences(v, document) } };
  }

  /**
   * Locates a value and records what it finds. `near` is where the value is expected (e.g. just below the
   * previous row of the same table); it is tried first, then `band` (or the whole page).
   */
  function locate(value: string, where: string, band: Band = null, near: Band = null): Box | null {
    if (!squash(value)) return null;
    const found = (near ? attempt(value, where, near) : null) ?? attempt(value, where, band);
    if (!found) {
      report.literales.push({ donde: where, modelo: value, severidad: severity, estado: "no_encontrado" });
      return null;
    }
    found.spans.forEach(span => st.mark(...span));
    if (found.finding) report.literales.push(found.finding);
    if (found.aviso) report.avisos.push(found.aviso);
    return found.box;
  }

  page.bloques.forEach((block, b) => {
    if (block.tipo === "texto") block.texto.split("\n").forEach((line, l) => { locate(line, `bloque ${b + 1} línea ${l + 1}`); });
    else verifyTable(b + 1, block, locate, report, severity);
  });

  // Document text not covered by any extracted value.
  let run: number[] = [];
  const runs: number[][] = [];
  for (let k = 0; k <= st.s.length; k++) {
    if (k < st.s.length && !st.used[k]) run.push(k);
    else if (run.length) { runs.push(run); run = []; }
  }
  for (const r of runs) {
    const chars = r.map(k => st.s[k]).join("");
    if ((chars.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) continue;
    if (reference.fuente === "ocr" && !/\p{L}{3,}|\p{N}{3,}/u.test(chars)) continue; // OCR noise around stamps and margins
    const text = [...new Set(r.map(k => st.owner[k]))].map(i => st.words[i].t).join(" ");
    report.omisiones.push({ textoDocumento: text, severidad: severity });
  }
  return report;
}

function verifyTable(b: number, block: TableBlock, locate: (value: string, where: string, band?: Band, near?: Band) => Box | null, report: PageReport, severity: Severity) {
  const { columnas, filas } = block;
  let headerRow: number | null = null;
  if (!columnas.some(c => c.trim())) {
    // The header may have been transcribed as an ordinary row.
    headerRow = filas.findIndex(row => {
      const filled = row.filter((c): c is string => !!c?.trim());
      return filled.length >= Math.max(3, Math.round(columnas.length * 0.8)) && filled.every(c => LETTER.test(c) && !/\d/u.test(c));
    });
    if (headerRow < 0) headerRow = null;
    else report.avisos.push(`bloque ${b}: la cabecera está en la fila ${headerRow + 1}, no en 'columnas'`);
  }
  const header = headerRow === null ? columnas : filas[headerRow].map(c => c ?? "");
  /** Locates one visual row: its longest cell (usually the description) fixes the vertical band for the others. */
  const locateRow = (row: (string | null)[], label: (c: number) => string, near: Band = null) => {
    const located = new Map<number, Box>();
    const cells = row.map((cell, c) => [c, cell] as const).filter((x): x is readonly [number, string] => !!x[1]?.trim());
    if (!cells.length) return located;
    const [anchorCol, anchorValue] = cells.reduce((best, x) => x[1].length > best[1].length ? x : best);
    const anchor = locate(anchorValue, label(anchorCol), null, near);
    if (anchor) located.set(anchorCol, anchor);
    const band: Band = anchor ? [anchor.y0, anchor.y1] : null;
    for (const [c, cell] of cells) {
      if (c === anchorCol) continue;
      const box = locate(cell, label(c), band);
      if (box) located.set(c, box);
    }
    return located;
  };
  // Rows are located in the order they are printed, header included: each one is searched first just below
  // the previous one, so identical rows of two similar tables ("LECHE ENTERA P6" in two tickets) are not swapped.
  // Header labels repeat across tables ("IVA", "Total"): the header is located as one anchored row too.
  let bottom: number | null = null;
  const advance = (located: Map<number, Box>) => { if (located.size) bottom = Math.max(...[...located.values()].map(box => box.y1)); };
  const nearNext = (): Band => bottom === null ? null : [bottom, bottom + NEXT_ROW_WINDOW];
  let headerLocated = new Map<number, Box>();
  if (headerRow === null) { headerLocated = locateRow(header, c => `bloque ${b} cabecera col ${c + 1}`); advance(headerLocated); }
  const boxes = new Map<string, Box>();
  filas.forEach((row, r) => {
    if (r === headerRow) {
      headerLocated = locateRow(header, c => `bloque ${b} cabecera col ${c + 1}`, nearNext());
      advance(headerLocated);
      return;
    }
    const located = locateRow(row, c => `bloque ${b} fila ${r + 1} col ${c + 1}`, nearNext());
    for (const [c, box] of located) boxes.set(`${r}:${c}`, box);
    advance(located);
  });
  const headerBoxes = header.map((_, c) => headerLocated.get(c) ?? null);

  const center = (box: Box) => (box.x0 + box.x1) / 2;
  const firstData = headerRow === null ? 0 : headerRow + 1;
  const numeric = [...boxes].map(([key, box]) => { const [r, c] = key.split(":").map(Number); return { r, c, box }; })
    .filter(({ r, c }) => r >= firstData && NUMERIC.test((filas[r][c] ?? "").trim()))
    .sort((x, y) => x.r - y.r || x.c - y.c);
  const refX = new Map<number, number>();
  let method: ColumnFinding["metodo"];
  if (headerBoxes.some(Boolean)) {
    method = "cabecera";
    headerBoxes.forEach((box, c) => { if (box) refX.set(c, center(box)); });
  } else {
    method = "alineacion";
    for (let c = 0; c < columnas.length; c++) {
      const xs = numeric.filter(n => n.c === c).map(n => center(n.box)).sort((x, y) => x - y);
      if (xs.length) refX.set(c, xs[Math.floor(xs.length / 2)]);
    }
    if (refX.size < 2) {
      report.avisos.push(`bloque ${b}: sin cabecera ni columnas numéricas suficientes; columnas no verificables`);
      return;
    }
  }
  for (const { r, c, box } of numeric) {
    const own = refX.get(c);
    if (own === undefined) {
      report.avisos.push(`bloque ${b} fila ${r + 1} col ${c + 1}: columna sin cabecera; no verificable`);
      continue;
    }
    const x = center(box);
    let best = c;
    for (const [col, ref] of refX) if (Math.abs(ref - x) < Math.abs(refX.get(best)! - x)) best = col;
    if (best !== c && Math.abs(own - x) - Math.abs(refX.get(best)! - x) > COLUMN_MARGIN) {
      report.columnas.push({ donde: `bloque ${b} fila ${r + 1}`, valor: filas[r][c] ?? "", metodo: method,
        columnaLectura: header[c] || `#${c + 1}`, columnaDocumento: header[best] || `#${best + 1}`, severidad: severity });
    }
  }
}
