/**
 * Evidence contract for Knowledge → Engine previews.
 *
 * A model never authorises a value. It points to numbered source lines and copies
 * the characters it read; this module checks that claim deterministically and
 * returns the ORIGINAL characters from the stored source.
 *
 * Declared normalisation (the only tolerance allowed):
 *   - Unicode compatibility (NFKC), e.g. non-breaking space → space.
 *   - Typographic quotes, apostrophes and dashes → their ASCII form.
 *   - Any run of whitespace, including line breaks → one space.
 * Letters, digits, punctuation and case are never altered, and nothing is
 * searched outside the lines the model cited.
 */

export type SpanClaim = { line: number; endLine: number; text: string };
export type ResolvedSpan = { lineStart: number; lineEnd: number; text: string };
export type SegmentBounds = { startLine: number; endLine: number };
export type SpanFailure =
  | "INVALID_LINES"
  | "LINES_OUTSIDE_DOCUMENT"
  | "SPAN_TOO_LONG"
  | "EMPTY_EVIDENCE"
  | "TEXT_NOT_IN_LINES";

/** Longest evidence window, in lines. Evidence is local; long quotes are not evidence. */
export const MAX_EVIDENCE_LINES = 12;

const TYPOGRAPHIC: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "´": "'", "`": "'",
  "“": "\"", "”": "\"", "„": "\"", "«": "\"", "»": "\"",
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "\u2212": "-",
};

type Normalized = { text: string; starts: number[]; ends: number[] };

function normalizeWithMap(value: string): Normalized {
  const out: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of value) {
    const width = char.length;
    const mapped = TYPOGRAPHIC[char] ?? char.normalize("NFKC");
    for (const piece of mapped) {
      if (/\s/u.test(piece)) {
        if (out.length && out[out.length - 1] !== " ") {
          out.push(" "); starts.push(index); ends.push(index + width);
        }
      } else {
        out.push(piece); starts.push(index); ends.push(index + width);
      }
    }
    index += width;
  }
  while (out.length && out[out.length - 1] === " ") { out.pop(); starts.pop(); ends.pop(); }
  return { text: out.join(""), starts, ends };
}

export function normalizeEvidenceText(value: string): string {
  return normalizeWithMap(value).text;
}

/** Source lines exactly as inventoried (the recognizer numbers the trimmed text). */
export function sourceLines(extractedText: string): string[] {
  return extractedText.trim().split(/\r?\n/);
}

export function numberLines(lines: readonly string[], bounds: SegmentBounds): string {
  return lines.slice(bounds.startLine - 1, bounds.endLine)
    .map((line, offset) => `${bounds.startLine + offset}: ${line}`).join("\n");
}

export function resolveSpan(
  lines: readonly string[],
  bounds: SegmentBounds,
  claim: SpanClaim,
): { ok: true; span: ResolvedSpan } | { ok: false; code: SpanFailure } {
  if (!Number.isInteger(claim.line) || !Number.isInteger(claim.endLine) || claim.endLine < claim.line)
    return { ok: false, code: "INVALID_LINES" };
  if (claim.line < bounds.startLine || claim.endLine > bounds.endLine || claim.endLine > lines.length)
    return { ok: false, code: "LINES_OUTSIDE_DOCUMENT" };
  if (claim.endLine - claim.line + 1 > MAX_EVIDENCE_LINES)
    return { ok: false, code: "SPAN_TOO_LONG" };
  const needle = normalizeEvidenceText(claim.text ?? "");
  if (!needle) return { ok: false, code: "EMPTY_EVIDENCE" };

  const window = lines.slice(claim.line - 1, claim.endLine);
  const raw = window.join("\n");
  const normalized = normalizeWithMap(raw);
  const at = normalized.text.indexOf(needle);
  if (at < 0) return { ok: false, code: "TEXT_NOT_IN_LINES" };

  const from = normalized.starts[at];
  const to = normalized.ends[at + needle.length - 1];
  // Report the lines that actually contain the evidence, not the cited window.
  const lineOf = (position: number) => claim.line + (raw.slice(0, position).match(/\n/g)?.length ?? 0);
  return { ok: true, span: { lineStart: lineOf(from), lineEnd: lineOf(to - 1), text: raw.slice(from, to) } };
}

/* ------------------------------------------------------------------------ */
/* Values must be literally supported by their own evidence.                 */
/* ------------------------------------------------------------------------ */

export type FieldType = "text" | "long_text" | "integer" | "decimal" | "boolean" | "date" | "datetime" | "enum";
export type TypedValue = string | number | boolean;
export type ValueFailure = "INVALID_CANONICAL_VALUE" | "VALUE_NOT_IN_EVIDENCE";

// Read once allowing space-grouped thousands ("1 370,57") and once without, so
// adjacent numbers ("1 100,00") are never merged into a single reading only.
const NUMBER_TOKENS = [
  /(?<![\d.,])(?:[-\u2212]?\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d+)?(?![\d.,])|[-\u2212]?\d+(?:[.,]\d+)*)/g,
  /(?<![\d.,])[-\u2212]?\d+(?:[.,]\d+)*/g,
];

/** Exact decimal representation: no rounding, floating-point tolerance or exponent notation. */
function decimalKey(value: string): string {
  const negative=value.startsWith("-");
  const [integer,fraction=""]=value.replace(/^-/,"").split(".");
  const whole=integer.replace(/^0+(?=\d)/,"");
  const tail=fraction.replace(/0+$/,"");
  const magnitude=whole+(tail ? "."+tail : "");
  return negative&&magnitude!=="0" ? "-"+magnitude : magnitude;
}

/** Consume entire numeric tokens before interpreting separators: never accept a truncated prefix. */
function numberReadings(text: string): string[] {
  const values=new Set<string>();
  for(const match of NUMBER_TOKENS.flatMap(pattern=>[...text.matchAll(pattern)])){
    const negative=/^[-\u2212]/.test(match[0]);
    const token=match[0].replace(/^[-\u2212]/,"").replace(/[ \u00A0\u202F]/g,"");
    const dots=(token.match(/\./g)??[]).length,commas=(token.match(/,/g)??[]).length;
    const readings:string[]=[];
    if(dots&&commas){
      const separator=token.lastIndexOf(".")>token.lastIndexOf(",") ? "." : ",";
      const thousands=separator==="." ? "," : ".";
      const parts=token.split(separator);
      if(parts.length!==2||!/^\d+$/.test(parts[1]))continue;
      const groups=parts[0].split(thousands);
      if(!/^\d{1,3}$/.test(groups[0])||!groups.slice(1).every(group=>/^\d{3}$/.test(group)))continue;
      readings.push(groups.join("")+"."+parts[1]);
    }else if(dots||commas){
      const groups=token.split(dots ? "." : ",");
      if(groups.length===2)readings.push(groups.join("."));
      if(/^\d{1,3}$/.test(groups[0])&&groups.slice(1).every(group=>/^\d{3}$/.test(group)))readings.push(groups.join(""));
    }else readings.push(token);
    for(const reading of readings)values.add(decimalKey((negative ? "-" : "")+reading));
  }
  return [...values];
}

/** Every full decimal-comma/decimal-point reading, retained for callers inspecting source numbers. */
export function numbersInText(text: string): number[] {
  return numberReadings(text).map(Number).filter(Number.isFinite);
}

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Dates written in a text. Numeric dates are read day-first (dd/mm/yyyy), the
 * convention of the documents this product handles; ISO dates are year-first.
 */
export function datesInText(text: string): string[] {
  const found = new Set<string>();
  const lower = normalizeEvidenceText(text).toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
  for (const m of lower.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) {
    const iso = isoDate(+m[1], +m[2], +m[3]); if (iso) found.add(iso);
  }
  for (const m of lower.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g)) {
    const iso = isoDate(+m[3], +m[2], +m[1]); if (iso) found.add(iso);
  }
  for (const m of lower.matchAll(/(?<!\d)(\d{1,2})(?:\s*de)?[\s.-]+([a-z]{3,10})\.?(?:\s*de\s*|[\s.,-]+)(\d{4}|\d{2})(?!\d)/g)) {
    const month = MONTHS[m[2]];
    if (month) { const iso = isoDate(+m[3], month, +m[1]); if (iso) found.add(iso); }
  }
  return [...found];
}

const CANONICAL_DECIMAL = /^-?\d+(?:\.\d+)?$/;
const CANONICAL_INTEGER = /^-?\d+$/;
const CANONICAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CANONICAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

const comparable = (value: string) => normalizeEvidenceText(value).toLocaleLowerCase("es");

/** Converts the model's canonical string and checks it against the value's own evidence. */
export function checkValue(type: FieldType, canonical: string, evidence: string):
  { ok: true; value: TypedValue } | { ok: false; code: ValueFailure } {
  const raw = (canonical ?? "").trim();
  switch (type) {
    case "decimal":
    case "integer": {
      if (!(type === "integer" ? CANONICAL_INTEGER : CANONICAL_DECIMAL).test(raw)) return { ok: false, code: "INVALID_CANONICAL_VALUE" };
      const value = Number(raw);
      if(!Number.isFinite(value)||(type==="integer"&&!Number.isSafeInteger(value)))return {ok:false,code:"INVALID_CANONICAL_VALUE"};
      return numberReadings(evidence).includes(decimalKey(raw))
        ? { ok: true, value } : { ok: false, code: "VALUE_NOT_IN_EVIDENCE" };
    }
    case "date": {
      if (!CANONICAL_DATE.test(raw) || isoDate(+raw.slice(0, 4), +raw.slice(5, 7), +raw.slice(8, 10)) !== raw)
        return { ok: false, code: "INVALID_CANONICAL_VALUE" };
      return datesInText(evidence).includes(raw) ? { ok: true, value: raw } : { ok: false, code: "VALUE_NOT_IN_EVIDENCE" };
    }
    case "datetime": {
      const m = CANONICAL_DATETIME.exec(raw);
      if (!m) return { ok: false, code: "INVALID_CANONICAL_VALUE" };
      const time = new RegExp(`(?<!\\d)0?${Number(m[2])}[:.h]${m[3]}(?!\\d)`);
      return datesInText(evidence).includes(m[1]) && time.test(evidence)
        ? { ok: true, value: raw } : { ok: false, code: "VALUE_NOT_IN_EVIDENCE" };
    }
    case "boolean":
      // A boolean is a reading of the cited lines, not a substring; the user reviews it.
      return raw === "true" || raw === "false" ? { ok: true, value: raw === "true" } : { ok: false, code: "INVALID_CANONICAL_VALUE" };
    default: {
      if (!normalizeEvidenceText(raw)) return { ok: false, code: "INVALID_CANONICAL_VALUE" };
      return comparable(evidence).includes(comparable(raw))
        ? { ok: true, value: normalizeEvidenceText(raw) } : { ok: false, code: "VALUE_NOT_IN_EVIDENCE" };
    }
  }
}

/** Identity comparison: case, accents, spaces and punctuation are not identity. */
export function identityToken(value: TypedValue): string {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
