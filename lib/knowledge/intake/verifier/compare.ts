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
  const st = new ReferenceStream(reference.palabras);
  // Rotated text (e.g. a registry note printed vertically in the margin) spans many rows; it never belongs to a row band.
  const vertical = reference.palabras.map(w => w.y1 - w.y0 > 0.02 && w.y1 - w.y0 > 2.5 * (w.x1 - w.x0));
  const inBand = ([a, b]: Span, band: Band) => {
    if (!band) return true;
    if (st.owner.slice(a, b).some(i => vertical[i])) return false;
    const box = st.box(a, b);
    return box.y1 >= band[0] - BAND_TOLERANCE && box.y0 <= band[1] + BAND_TOLERANCE;
  };
  const preferFree = (spans: Span[]) => spans.sort((x, y) => Number(!st.free(...x)) - Number(!st.free(...y)));

  function locate(value: string, where: string, band: Band = null): Box | null {
    const v = squash(value);
    if (!v) return null;
    // 1. exact, on word boundaries
    const exact = preferFree(st.occurrences(v).filter(o => inBand(o, band)));
    if (exact.length) { st.mark(...exact[0]); return st.box(...exact[0]); }
    // 2. every word present, but separated by the reference's reading order
    const tokens = value.split(/\s+/u).filter(Boolean);
    const spans: Span[] = [];
    const missing: string[] = [];
    for (const token of tokens) {
      // Repeated words ("DE", "DOS"…) each take their own occurrence, preferably the next one in reading order.
      const previous = spans.at(-1)?.[1] ?? -1;
      const taken = (o: Span) => spans.some(s => s[0] === o[0]);
      const found = st.occurrences(squash(token)).filter(o => inBand(o, band) && !taken(o)).sort((x, y) =>
        Number(!st.free(...x)) - Number(!st.free(...y)) || Number(x[0] < previous) - Number(y[0] < previous) || Math.abs(x[0] - previous) - Math.abs(y[0] - previous));
      if (found.length) spans.push(found[0]); else missing.push(token);
    }
    if (tokens.length > 1 && !missing.length) {
      spans.forEach(span => st.mark(...span));
      return st.box(Math.min(...spans.map(s => s[0])), Math.max(...spans.map(s => s[1])));
    }
    if (!/[\p{L}\p{N}]/u.test(v)) {
      // Drawn marks (radio buttons, ticks, bullets) are graphics, not text: they cannot be checked against a text reading.
      report.avisos.push(`${where}: «${value}» no aparece como texto en el documento (puede ser un símbolo dibujado)`);
      return null;
    }
    // 2b. long sentence with a few differing words: report the words, which is what a reader can check
    if (tokens.length >= 4 && missing.length <= tokens.length / 2) {
      spans.forEach(span => st.mark(...span));
      const diferencias = missing.map(token => {
        // Very short words ("se", "Nº") have no meaningful closest match: report them as absent.
        if (squash(token).length < 4) return { modelo: token, documento: "" };
        const { start, end, distance } = fuzzySubstring(squash(token), st.s);
        if (end <= start || distance > Math.max(1, Math.floor(token.length / 2))) return { modelo: token, documento: "" };
        let s0 = start, s1 = end;
        while (s0 > 0 && st.owner[s0 - 1] === st.owner[s0]) s0--;
        while (s1 < st.s.length && st.owner[s1] === st.owner[s1 - 1]) s1++;
        st.mark(s0, s1);
        return { modelo: token, documento: st.s.slice(s0, s1) };
      });
      report.literales.push({ donde: where, modelo: value, severidad: severity, estado: "distinto", diferencias });
      return spans.length ? st.box(Math.min(...spans.map(s => s[0])), Math.max(...spans.map(s => s[1]))) : null;
    }
    // 3. approximate: within the row band when known, otherwise the whole page; text not yet matched to another value first
    const all = Array.from({ length: st.s.length }, (_, k) => k).filter(k => !band || inBand([k, k + 1], band));
    const limit = Math.max(1, Math.floor(v.length / 3));
    const attempt = (candidates: number[]) => {
      const text = candidates.map(k => st.s[k]).join("");
      const match = text ? fuzzySubstring(v, text) : { start: 0, end: 0, distance: v.length };
      return { index: candidates, region: text, ...match, ok: match.end > match.start && match.distance <= limit };
    };
    let best = attempt(all.filter(k => !st.used[k]));
    if (!best.ok) best = attempt(all);
    const { index, region, start, end } = best;
    const finding: LiteralFinding = { donde: where, modelo: value, severidad: severity, estado: "no_encontrado" };
    if (best.ok) {
      let s0 = index[start], s1 = index[end - 1] + 1;
      while (s0 > 0 && st.owner[s0 - 1] === st.owner[s0]) s0--;
      while (s1 < st.s.length && st.owner[s1] === st.owner[s1 - 1]) s1++;
      const document = s1 - s0 <= end - start + 12 ? st.s.slice(s0, s1) : region.slice(start, end);
      Object.assign(finding, { estado: "distinto", documento: document, diferencias: describeDifferences(v, document) });
      report.literales.push(finding);
      index.slice(start, end).forEach(k => { st.used[k] = true; });
      return st.box(index[start], index[end - 1] + 1);
    }
    report.literales.push(finding);
    return null;
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

function verifyTable(b: number, block: TableBlock, locate: (value: string, where: string, band?: Band) => Box | null, report: PageReport, severity: Severity) {
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
  const locateRow = (row: (string | null)[], label: (c: number) => string) => {
    const located = new Map<number, Box>();
    const cells = row.map((cell, c) => [c, cell] as const).filter((x): x is readonly [number, string] => !!x[1]?.trim());
    if (!cells.length) return located;
    const [anchorCol, anchorValue] = cells.reduce((best, x) => x[1].length > best[1].length ? x : best);
    const anchor = locate(anchorValue, label(anchorCol));
    if (anchor) located.set(anchorCol, anchor);
    const band: Band = anchor ? [anchor.y0, anchor.y1] : null;
    for (const [c, cell] of cells) {
      if (c === anchorCol) continue;
      const box = locate(cell, label(c), band);
      if (box) located.set(c, box);
    }
    return located;
  };
  // Header labels repeat across tables ("IVA", "Total"): locate them as one row, not each one anywhere on the page.
  const headerLocated = locateRow(header, c => `bloque ${b} cabecera col ${c + 1}`);
  const headerBoxes = header.map((_, c) => headerLocated.get(c) ?? null);

  const boxes = new Map<string, Box>();
  filas.forEach((row, r) => {
    if (r === headerRow) return;
    for (const [c, box] of locateRow(row, c => `bloque ${b} fila ${r + 1} col ${c + 1}`)) boxes.set(`${r}:${c}`, box);
  });

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
