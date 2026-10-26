import type { Page, TableBlock } from "./contract";
const numericCell = /^(?:[€$£]\s*)?[+−-]?\d[\d.,]*(?:\s*[€$£%])?$/u;
function numericRow(line: string): string[] | null {
  const values = line.trim().replace(/([€$£])\s+(?=[+−-]?\d)/gu,"$1").replace(/(\d)\s+([€$£%])/gu,"$1$2").split(/\s+/);
  return values.length >= 2 && values.every(value => numericCell.test(value)) && (/\s{2,}|\t/.test(line) || /\d[.,]\d/.test(line)) ? values : null;
}
/** Review trigger only: no meanings or column positions are inferred from flattened text. */
export function detachedTableRows(pages: Page[]): { pagina: number; bloque: number }[] {
  const result: { pagina: number; bloque: number }[] = [];
  for (const page of pages) for (let i = 1; i < page.bloques.length; i++) {
    const block = page.bloques[i];
    if (block.tipo === "texto" && page.bloques[i-1].tipo === "tabla" && block.texto.split(/\r?\n/).some(line => numericRow(line))) result.push({ pagina: page.numero, bloque: i+1 });
  }
  return result;
}
const textKey = (value: string | null) => value === null ? null : value.replace(/\s+/g," ").trim();
const numericKey = (value: string) => value.replace(/[€$£%]/gu,"").trim();
/** A structural correction may add summary rows, never discard detail rows or their existing column associations. */
export function assertTableRepairPreserves(original: Page[], corrected: Page[]) {
  for (const page of original) {
    const tables = page.bloques.filter((b): b is TableBlock => b.tipo === "tabla");
    const next = corrected.find(p => p.numero === page.numero)?.bloques.filter((b): b is TableBlock => b.tipo === "tabla") ?? [];
    if (tables.length !== next.length) throw new Error("La revisión ha cambiado el número de tablas en lugar de conservarlas");
    for (let i = 0; i < tables.length; i++) {
      if (JSON.stringify(tables[i].columnas.map(textKey)) !== JSON.stringify(next[i].columnas.map(textKey))) throw new Error("La revisión ha modificado las columnas originales");
      const remaining = next[i].filas.map(row => JSON.stringify(row.map(textKey)));
      for (const row of tables[i].filas) {
        const index = remaining.indexOf(JSON.stringify(row.map(textKey)));
        if (index < 0) throw new Error("La revisión ha perdido o cambiado una fila de detalle");
        remaining.splice(index,1);
      }
    }
    for (const suspect of detachedTableRows([page])) {
      const before = page.bloques[suspect.bloque-2] as TableBlock;
      const target = next[tables.indexOf(before)];
      const block = page.bloques[suspect.bloque-1];
      if (block.tipo !== "texto") continue;
      for (const line of block.texto.split(/\r?\n/)) {
        const values = numericRow(line);
        if (!values) continue;
        const preserved = target.filas.some(row => {
          const cells = row.filter((cell): cell is string => cell !== null).map(numericKey);
          for (const value of values.map(numericKey)) {
            const index = cells.indexOf(value);
            if (index < 0) return false;
            cells.splice(index,1);
          }
          return true;
        });
        if (!preserved) throw new Error("La revisión no ha conservado los valores del resumen en celdas de su tabla");
      }
    }
  }
}
