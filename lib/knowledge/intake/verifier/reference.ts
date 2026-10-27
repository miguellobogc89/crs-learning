import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { PageReference, RefWord } from "./contract";

/**
 * Independent reading of the original PDF, page by page:
 * - pages with an embedded text layer are read directly (exact characters and positions);
 * - image-only pages (scans, photos, flattened PDFs) are read with Google Cloud Vision OCR.
 * Coordinates are normalised to the page (0..1, origin top-left).
 */

/** Fewer embedded characters than this means the page is effectively an image. */
const MIN_TEXT_LAYER_CHARS = 20;
/** Synchronous files:annotate accepts at most 5 pages per request. */
const VISION_PAGES_PER_REQUEST = 5;
const VISION_TIMEOUT_MS = 90_000;
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/files:annotate";

type TextItem = { str: string; transform: number[]; width: number; height: number };
type Matrix = number[];
/** pdf.js operator codes used to detect scans (resolved from the bundled pdf.js; stable across versions). */
type Ops = Record<string, number>;
export type TextLayerPage = { words: RefWord[]; scanned: boolean };

const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const multiply = (m: Matrix, t: Matrix): Matrix => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3],
  m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];

/**
 * Splits a positioned text run into words. The run may be rotated (e.g. a registry note printed vertically
 * in the margin): each word's box is the bounding box of its rotated rectangle in page (viewport) space.
 */
function runWords(item: TextItem, view: { transform: Matrix; width: number; height: number }): RefWord[] {
  const [a, b, c, d, x, y] = item.transform;
  const scaleU = Math.hypot(a, b) || 1;
  const dirU = [a / scaleU, b / scaleU];
  const heightV = item.height || Math.hypot(c, d) || 1;
  const dirV = Math.hypot(c, d) ? [c / Math.hypot(c, d), d / Math.hypot(c, d)] : [-dirU[1], dirU[0]];
  const rotated = Math.abs(dirU[1]) > 0.09; // more than ~5 degrees
  const length = item.str.length || 1;
  const words: RefWord[] = [];
  for (const match of item.str.matchAll(/\S+/gu)) {
    const from = item.width * (match.index ?? 0) / length;
    const to = item.width * ((match.index ?? 0) + match[0].length) / length;
    const corners = [[from, 0], [to, 0], [from, heightV], [to, heightV]].map(([u, v]) =>
      apply(view.transform, x + dirU[0] * u + dirV[0] * v, y + dirU[1] * u + dirV[1] * v));
    const xs = corners.map(p => p[0] / view.width), ys = corners.map(p => p[1] / view.height);
    words.push({ t: match[0], x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), ...(rotated ? { r: true as const } : {}) });
  }
  return words;
}

/**
 * A page is a scan when one image covers almost all of it and its text is drawn invisibly (render mode 3):
 * that text is a third-party OCR (scanner apps), not the document's own text, so it is not used as reference.
 */
export function isScannedPage(operators: { fnArray: number[]; argsArray: unknown[][] }, ops: Ops, pageArea: number) {
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let mode = 0;
  const stack: { ctm: Matrix; mode: number }[] = [];
  let cover = 0, visible = 0, invisible = 0;
  const shows = new Set([ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText]);
  const images = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject]);
  operators.fnArray.forEach((fn, k) => {
    const args = operators.argsArray[k] ?? [];
    if (fn === ops.save) stack.push({ ctm, mode });
    else if (fn === ops.restore) ({ ctm, mode } = stack.pop() ?? { ctm, mode });
    else if (fn === ops.transform) ctm = multiply(ctm, args as number[]);
    else if (fn === ops.setTextRenderingMode) mode = Number(args[0]);
    else if (images.has(fn)) cover = Math.max(cover, Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / pageArea);
    else if (shows.has(fn)) { if ((mode & 3) === 3) invisible++; else visible++; }
  });
  return cover >= 0.85 && invisible > 0 && invisible >= 4 * visible;
}

/** Reading order: visual lines top to bottom, words left to right inside each line. */
export function orderWords(words: RefWord[]): RefWord[] {
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: RefWord[][] = [];
  for (const word of sorted) {
    const mid = (word.y0 + word.y1) / 2;
    const line = lines.find(l => { const ref = l[0]; return mid >= ref.y0 && mid <= ref.y1; });
    if (line) line.push(word); else lines.push([word]);
  }
  return lines.flatMap(line => line.sort((a, b) => a.x0 - b.x0));
}

export async function readTextLayer(buffer: Buffer): Promise<TextLayerPage[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const ops = (await getResolvedPDFJS()).OPS as unknown as Ops;
  try {
    const pages: TextLayerPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Marked-content entries carry no text; copy only the fields used, independent of pdf.js item typings.
      const items: TextItem[] = content.items.flatMap(i => "str" in i && typeof i.str === "string" && i.str.trim()
        ? [{ str: i.str, transform: Array.from(i.transform as ArrayLike<number>), width: Number(i.width), height: Number(i.height) }] : []);
      const view = { transform: Array.from(viewport.transform as ArrayLike<number>), width: viewport.width, height: viewport.height };
      const scanned = items.length > 0 && isScannedPage(await page.getOperatorList() as { fnArray: number[]; argsArray: unknown[][] }, ops, viewport.width * viewport.height);
      pages.push({ words: orderWords(items.flatMap(item => runWords(item, view))), scanned });
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

type Vertex = { x?: number; y?: number };
type VisionWord = { boundingBox?: { normalizedVertices?: Vertex[] }; symbols?: { text?: string }[] };
type VisionPage = { blocks?: { paragraphs?: { words?: VisionWord[] }[] }[] };
type VisionFileResponse = { responses?: { responses?: { fullTextAnnotation?: { pages?: VisionPage[] }; context?: { pageNumber?: number }; error?: { message?: string } }[] }[]; error?: { message?: string } };

/** Converts a Vision files:annotate response into words per page number (block → paragraph → word order). */
export function parseVisionResponse(body: VisionFileResponse): Map<number, RefWord[]> {
  if (body.error) throw new Error(`Google Vision: ${body.error.message ?? "error desconocido"}`);
  const pages = new Map<number, RefWord[]>();
  for (const file of body.responses ?? []) {
    for (const response of file.responses ?? []) {
      if (response.error) throw new Error(`Google Vision: ${response.error.message ?? "error en una página"}`);
      const number = response.context?.pageNumber;
      if (!number) throw new Error("Google Vision devolvió una página sin número");
      const words: RefWord[] = [];
      for (const page of response.fullTextAnnotation?.pages ?? []) for (const block of page.blocks ?? [])
        for (const paragraph of block.paragraphs ?? []) for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map(s => s.text ?? "").join("");
          const vertices = word.boundingBox?.normalizedVertices ?? [];
          if (!text.trim() || !vertices.length) continue;
          const xs = vertices.map(v => v.x ?? 0), ys = vertices.map(v => v.y ?? 0);
          words.push({ t: text, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
        }
      pages.set(number, words);
    }
  }
  return pages;
}

export function visionApiKey() {
  return process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() || null;
}

export async function readWithVision(buffer: Buffer, pageNumbers: number[], apiKey: string, fetcher: typeof fetch = fetch): Promise<Map<number, RefWord[]>> {
  const result = new Map<number, RefWord[]>();
  const content = buffer.toString("base64");
  for (let i = 0; i < pageNumbers.length; i += VISION_PAGES_PER_REQUEST) {
    const pages = pageNumbers.slice(i, i + VISION_PAGES_PER_REQUEST);
    // Key in a header, not the URL, so it never appears in request logs.
    const response = await fetcher(VISION_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey }, signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      body: JSON.stringify({ requests: [{ inputConfig: { content, mimeType: "application/pdf" }, pages,
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["es"] } }] }),
    });
    const body = await response.json().catch(() => ({})) as VisionFileResponse;
    if (!response.ok) throw new Error(`Google Vision respondió ${response.status}: ${body.error?.message ?? "sin detalle"}`);
    for (const [page, words] of parseVisionResponse(body)) result.set(page, words);
  }
  for (const page of pageNumbers) if (!result.has(page)) throw new Error(`Google Vision no devolvió la página ${page}`);
  return result;
}

/** Text layer when present; OCR only for the pages that lack one. Missing OCR configuration is reported per page, never hidden. */
export async function readReference(buffer: Buffer, deps: { apiKey?: string | null; fetcher?: typeof fetch } = {}): Promise<PageReference[]> {
  const layer = await readTextLayer(buffer);
  // Image pages: no usable text of their own, or a scan whose text layer is a third-party OCR.
  const imagePages = layer.map((page, i) => ({ ...page, n: i + 1 }))
    .filter(p => p.scanned || p.words.reduce((sum, w) => sum + w.t.length, 0) < MIN_TEXT_LAYER_CHARS).map(p => p.n);
  const apiKey = deps.apiKey === undefined ? visionApiKey() : deps.apiKey;
  const ocr = imagePages.length && apiKey ? await readWithVision(buffer, imagePages, apiKey, deps.fetcher) : new Map<number, RefWord[]>();
  return layer.map(({ words, scanned }, i): PageReference => {
    const numero = i + 1;
    if (!imagePages.includes(numero)) return { numero, fuente: "capa_texto", palabras: words };
    // Vision already returns words in block reading order, which keeps visual columns together.
    if (ocr.has(numero)) return { numero, fuente: "ocr", palabras: ocr.get(numero)! };
    return { numero, fuente: "sin_referencia", palabras: [], aviso: scanned
      ? "La página es un escaneo cuyo texto incrustado procede de otro reconocimiento de imagen; falta GOOGLE_CLOUD_VISION_API_KEY para verificarla"
      : "La página es una imagen y falta GOOGLE_CLOUD_VISION_API_KEY; no se ha podido verificar" };
  });
}
