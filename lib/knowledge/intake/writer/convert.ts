/**
 * Printed text → typed Engine values. Pure and conservative: a value that cannot be read without guessing is NOT
 * converted (the field stays empty and the printed text is kept as evidence). Decimals are returned as strings
 * ("31.4049") to avoid floating point rounding, dates as ISO "YYYY-MM-DD".
 */
export type Conversion<T> = { ok: true; value: T; inferred?: string } | { ok: false; reason: string };

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
  january: 1, jan: 1, february: 2, march: 3, april: 4, apr: 4, june: 6, july: 7, august: 8, aug: 8, september: 9,
  october: 10, november: 11, december: 12, dec: 12,
};

/**
 * Amounts, rates and quantities as printed: "31,4049 €", "1.234,56", "21.00 %", "-5,00", "55.061" (thousands),
 * "12,000 kW". When both separators appear the last one is decimal. A single "." followed by exactly three digits
 * is a thousands separator only if the document writes decimals with a comma (`commaDecimals`); otherwise it is
 * ambiguous and not converted.
 */
export function toDecimal(printed: string, { commaDecimals = true }: { commaDecimals?: boolean } = {}): Conversion<string> {
  const text = printed.normalize("NFKC").trim();
  const match = /^([-−+]?)\s*(?:[€$£]\s*)?(\d[\d.,\s]*)(?:\s*(?:€|eur|euros?|%|[a-zA-Z/²³]{1,8}))?\s*(-)?$/i.exec(text);
  if (!match) return { ok: false, reason: "no es un número" };
  const negative = match[1] === "-" || match[1] === "−" || match[3] === "-";
  let digits = match[2].replace(/\s+/g, "");
  const lastComma = digits.lastIndexOf(","), lastDot = digits.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    digits = digits.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    if ((digits.match(/,/g) ?? []).length > 1) {
      // "1,234,567": commas as thousands only when every group has three digits.
      if (!/^\d{1,3}(,\d{3})+$/.test(digits)) return { ok: false, reason: "separadores ambiguos" };
      digits = digits.replaceAll(",", "");
    } else digits = digits.replace(",", ".");
  } else if (lastDot >= 0) {
    const groups = digits.split(".");
    if (groups.length > 2) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(digits)) return { ok: false, reason: "separadores ambiguos" };
      digits = groups.join("");
    } else if (groups[1].length === 3) {
      if (!commaDecimals) return { ok: false, reason: "punto ambiguo (¿miles o decimales?)" };
      digits = groups.join("");
    }
  }
  if (!/^\d+(\.\d+)?$/.test(digits)) return { ok: false, reason: "no es un número" };
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return { ok: true, value: (negative && !/^0(\.0+)?$/.test(normalized) ? "-" : "") + normalized };
}

export function toInteger(printed: string): Conversion<number> {
  const decimal = toDecimal(printed);
  if (!decimal.ok) return decimal;
  if (!/^-?\d+$/.test(decimal.value)) return { ok: false, reason: "no es un número entero" };
  return { ok: true, value: Number(decimal.value) };
}

const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
};

/**
 * Dates as printed: "27/01/2026", "27-01-26", "2026-01-27", "04 de Enero de 2026", "2 Febrero 2026", "17 Dic".
 * Day-first (Spanish documents). A date without year takes it from `reference` (the invoice date): the latest such
 * date not after it, and says so in `inferred`.
 */
export function toDate(printed: string, reference?: string | null): Conversion<string> {
  const text = printed.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return done(iso(+m[1], +m[2], +m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (m) return done(iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]));
  m = /^(\d{1,2})(?:\s+de)?\s+([a-záéíóú]+)\.?(?:\s+(?:de\s+|del\s+)?(\d{4}))?$/.exec(text);
  if (m) {
    const month = MONTHS[m[2].normalize("NFD").replace(/[̀-ͯ]/g, "")];
    if (!month) return { ok: false, reason: "mes no reconocido" };
    if (m[3]) return done(iso(+m[3], month, +m[1]));
    const ref = reference && /^\d{4}-\d{2}-\d{2}$/.test(reference) ? reference : null;
    if (!ref) return { ok: false, reason: "fecha sin año" };
    const [ry, rm, rd] = ref.split("-").map(Number);
    const year = month < rm || (month === rm && +m[1] <= rd) ? ry : ry - 1;
    const value = iso(year, month, +m[1]);
    return value ? { ok: true, value, inferred: `año ${year} deducido de la fecha de la factura` } : { ok: false, reason: "fecha inválida" };
  }
  return { ok: false, reason: "formato de fecha no reconocido" };
  function done(value: string | null): Conversion<string> {
    return value ? { ok: true, value } : { ok: false, reason: "fecha inválida" };
  }
}

/** Whether a document writes decimals with a comma ("38,00"), judged from its printed amounts. */
export function usesCommaDecimals(samples: string[]): boolean {
  let comma = 0, dot = 0;
  for (const s of samples) {
    if (/\d,\d{1,2}(?!\d)/.test(s)) comma++;
    if (/\d\.\d{1,2}(?!\d)/.test(s)) dot++;
  }
  return comma >= dot;
}
