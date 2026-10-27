import { getDocumentProxy } from "unpdf";
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

/** Splits a positioned text run into words, distributing its width proportionally to characters. */
function runWords(item: TextItem, pageWidth: number, pageHeight: number): RefWord[] {
  const [, , , , x, baseline] = item.transform;
  const height = item.height || Math.abs(item.transform[3]) || 1;
  const y1 = (pageHeight - baseline) / pageHeight;
  const y0 = (pageHeight - baseline - height) / pageHeight;
  const length = item.str.length || 1;
  const words: RefWord[] = [];
  for (const match of item.str.matchAll(/\S+/gu)) {
    const start = match.index ?? 0;
    words.push({ t: match[0],
      x0: (x + item.width * start / length) / pageWidth,
      x1: (x + item.width * (start + match[0].length) / length) / pageWidth, y0, y1 });
  }
  return words;
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

export async function readTextLayer(buffer: Buffer): Promise<RefWord[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const pages: RefWord[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Marked-content entries carry no text; copy only the fields used, independent of pdf.js item typings.
      const items: TextItem[] = content.items.flatMap(i => "str" in i && typeof i.str === "string" && i.str.trim()
        ? [{ str: i.str, transform: Array.from(i.transform as ArrayLike<number>), width: Number(i.width), height: Number(i.height) }] : []);
      pages.push(orderWords(items.flatMap(item => runWords(item, width, height))));
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
  const imagePages = layer.map((words, i) => ({ words, n: i + 1 }))
    .filter(p => p.words.reduce((sum, w) => sum + w.t.length, 0) < MIN_TEXT_LAYER_CHARS).map(p => p.n);
  const apiKey = deps.apiKey === undefined ? visionApiKey() : deps.apiKey;
  const ocr = imagePages.length && apiKey ? await readWithVision(buffer, imagePages, apiKey, deps.fetcher) : new Map<number, RefWord[]>();
  return layer.map((words, i): PageReference => {
    const numero = i + 1;
    if (!imagePages.includes(numero)) return { numero, fuente: "capa_texto", palabras: words };
    // Vision already returns words in block reading order, which keeps visual columns together.
    if (ocr.has(numero)) return { numero, fuente: "ocr", palabras: ocr.get(numero)! };
    return { numero, fuente: "sin_referencia", palabras: [], aviso: "La página es una imagen y falta GOOGLE_CLOUD_VISION_API_KEY; no se ha podido verificar" };
  });
}
