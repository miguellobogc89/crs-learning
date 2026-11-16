/**
 * The VAT rate of each line of an invoice, from what the document prints. Pure.
 *
 * Many invoices do not print the rate on each line: Mercadona's tickets only print the summary at the bottom
 * («4 % base … cuota …», «21 % …»), and Makro's print a code (1, 2, A, B…) whose rate is only in that summary.
 * Read «as printed», those lines got no rate or a code taken for a rate («2 %»). Here each line gets its rate:
 *
 * 1. A real rate printed on the line (one of the summary's, or any valid rate when there is no summary) stays.
 * 2. Both amounts printed (without and with tax): the rate is their ratio.
 * 3. Only one rate in the summary: every line has it.
 * 4. Codes: the lines of each code add up to the base (or base + cuota) of exactly one rate → that code is that rate.
 * 5. Lines with nothing: the only way to split them among the summary's rates so that each rate's lines add up to
 *    its amount (when there is exactly one way; with two ways it stays empty, never guessed).
 *
 * Whatever cannot be told stays empty (the product's VAT in the catalog fills it later).
 */
export type TaxLine = { rate: number | null; code: string | null; total: number | null; totalWithTax: number | null };
export type TaxSummary = { rate: number; base: number | null; cuota: number | null };
export type LineRate = { rate: number; how: "impreso" | "importes" | "unico" | "codigo" | "reparto" };

/** Rates that exist in Spain: IVA (general, reduced, super-reduced, 5 % and 0 %), IGIC, surcharge of equivalence. */
const VALID = [0, 0.5, 1.4, 1.75, 3, 4, 5, 5.2, 7, 9.5, 10, 15, 21];
const isValid = (r: number) => VALID.some(v => Math.abs(v - r) < 1e-9);
const cents = (n: number) => Math.round(n * 100);
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.005);

export function lineTaxRates(lines: TaxLine[], summary: TaxSummary[]): (LineRate | null)[] {
  const rates = [...new Map(summary.filter(s => isValid(s.rate)).map(s => [s.rate, s])).values()];
  const known = (r: number) => rates.length ? rates.some(s => s.rate === r) : isValid(r);
  const out: (LineRate | null)[] = lines.map(l => l.rate !== null && known(l.rate) ? { rate: l.rate, how: "impreso" } : null);
  // 2. Both amounts printed.
  lines.forEach((l, i) => {
    if (out[i] || !l.total || !l.totalWithTax || l.total <= 0) return;
    const ratio = (l.totalWithTax / l.total - 1) * 100;
    const r = (rates.length ? rates.map(s => s.rate) : VALID).find(v => Math.abs(v - ratio) < 0.3);
    if (r !== undefined) out[i] = { rate: r, how: "importes" };
  });
  if (!rates.length) return out;
  // 3. A single rate.
  if (rates.length === 1) return out.map(o => o ?? { rate: rates[0].rate, how: "unico" });
  // Whether line amounts are without tax (they add up to the bases) or with it (to base + cuota).
  const amounts = (s: TaxSummary) => [s.base, s.base !== null && s.cuota !== null ? s.base + s.cuota : null].filter((v): v is number => v !== null);
  // 4. Codes (printed on the line but not a rate of the summary).
  const codeOf = (l: TaxLine) => l.code ?? (l.rate !== null ? String(l.rate) : null);
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => { const c = codeOf(l); if (!out[i] && c) groups.set(c, [...(groups.get(c) ?? []), i]); });
  const taken = new Set<number>();
  for (const [, idx] of groups) {
    if (idx.some(i => lines[i].total === null)) continue;
    const sum = idx.reduce((a, i) => a + lines[i].total!, 0);
    const fits = rates.filter(s => !taken.has(s.rate) && amounts(s).some(v => near(sum, v)));
    if (fits.length !== 1) continue;
    taken.add(fits[0].rate);
    for (const i of idx) out[i] = { rate: fits[0].rate, how: "codigo" };
  }
  // 5. Lines with nothing: split them among the rates still unexplained, only if there is exactly one way.
  const free = lines.map((l, i) => i).filter(i => !out[i]);
  if (!free.length || free.some(i => lines[i].total === null) || free.length > 40) return out;
  const used = new Map<number, number>();
  lines.forEach((l, i) => { const o = out[i]; if (o && l.total !== null) used.set(o.rate, (used.get(o.rate) ?? 0) + l.total); });
  for (const asWithTax of [false, true]) {
    const target = rates.map(s => {
      const v = asWithTax ? (s.base !== null && s.cuota !== null ? s.base + s.cuota : null) : s.base;
      return v === null ? null : cents(v - (used.get(s.rate) ?? 0));
    });
    if (target.some(t => t === null || t < 0)) continue;
    const values = free.map(i => cents(lines[i].total!));
    if (Math.abs(values.reduce((a, b) => a + b, 0) - (target as number[]).reduce((a, b) => a + b, 0)) > 2 * rates.length) continue;
    const split = uniqueSplit(values, target as number[]);
    if (split) { split.forEach((k, j) => { out[free[j]] = { rate: rates[k].rate, how: "reparto" }; }); return out; }
  }
  return out;
}

/**
 * The only way to give each value to one bucket so that every bucket adds up to its target (± 1 cent per value,
 * for printed rounding); null when there is none or more than one. Small invoices: a search with memo.
 */
function uniqueSplit(values: number[], targets: number[]): number[] | null {
  const n = values.length, k = targets.length;
  if (k > 3) return null;
  const slack = Math.max(2, Math.ceil(n / 2));
  // Two buckets: which values go to the first; the rest go to the second. Three: first, then second among the rest.
  const solutions: number[][] = [];
  let steps = 0;
  const done = () => solutions.length >= 50 || steps > 300_000;
  const assign = new Array<number>(n).fill(k - 1);
  const rec = (bucket: number, from: number, left: number[]) => {
    if (done()) return;
    if (bucket === k - 1) {
      const sum = left.reduce((a, i) => a + values[i], 0);
      if (Math.abs(sum - targets[bucket]) <= slack) solutions.push([...assign]);
      return;
    }
    // Subsets of `left` adding up to targets[bucket]: depth-first with a reachable-sum cut.
    const pick: number[] = [];
    const go = (j: number, sum: number) => {
      if (done() || ++steps > 300_000) return;
      if (Math.abs(sum - targets[bucket]) <= slack) {
        const rest = left.filter(i => !pick.includes(i));
        for (const i of pick) assign[i] = bucket;
        rec(bucket + 1, 0, rest);
        for (const i of pick) assign[i] = k - 1;
      }
      for (let x = j; x < left.length; x++) {
        const v = values[left[x]];
        if (sum + v > targets[bucket] + slack) continue;
        pick.push(left[x]); go(x + 1, sum + v); pick.pop();
        if (done()) return;
      }
    };
    go(from, 0);
  };
  rec(0, 0, values.map((_, i) => i));
  // Different subsets with the same values (two equal lines swapped) are the same answer for the lines' rates
  // only when the values are equal: compare as sorted value lists per bucket.
  if (!solutions.length || steps > 300_000) return null;
  const key = (s: number[]) => targets.map((_, b) => values.filter((_, i) => s[i] === b).sort((x, y) => x - y).join(",")).join("|");
  const distinct = new Set(solutions.map(key));
  return distinct.size === 1 ? solutions[0] : null;
}
