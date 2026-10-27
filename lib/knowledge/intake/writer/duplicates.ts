/**
 * Lines read twice: a PDF with the "original" and the "copia" of an invoice yields every line twice. Pure checks,
 * deliberately strict, so two genuinely equal purchases on one invoice are never dropped:
 * - while importing, the second half of the lines is an exact repetition of the first half, and (when the invoice
 *   prints a subtotal) all lines add up to twice it;
 * - on saved data, every line appears an even number of times and they add up to twice the net amount.
 */
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.01);

/** Import time: indexes of the rows to drop (the repeated second half), or none. */
export function copiedHalf(rows: Record<string, string | null>[], subtotal: number | null, amountOf: (row: Record<string, string | null>) => number | null): number[] {
  const n = rows.length;
  if (n < 2 || n % 2) return [];
  const half = n / 2;
  const same = (a: Record<string, string | null>, b: Record<string, string | null>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  for (let i = 0; i < half; i++) if (!same(rows[i], rows[i + half])) return [];
  if (subtotal === null) { if (n < 4) return []; }
  else {
    const amounts = rows.map(amountOf);
    if (amounts.some(a => a === null)) return [];
    if (!close((amounts as number[]).reduce((s, a) => s + a, 0), 2 * subtotal)) return [];
  }
  return Array.from({ length: half }, (_, i) => i + half);
}

/** Saved data: ids of the extra copies (the later one of each pair), or none. */
export function extraCopies(lines: { id: string; key: string; amount: number | null }[], net: number | null): string[] {
  if (lines.length < 2 || net === null || lines.some(l => l.amount === null)) return [];
  const sum = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  if (!close(sum, 2 * net)) return [];
  const groups = new Map<string, string[]>();
  for (const l of lines) groups.set(l.key, [...(groups.get(l.key) ?? []), l.id]);
  if ([...groups.values()].some(ids => ids.length % 2)) return [];
  return [...groups.values()].flatMap(ids => ids.slice(ids.length / 2));
}
