import type { SchemaDiscoveryProposal } from "../schema-discovery/validation";

type Row = { entity: string; values: Record<string, unknown>; evidence: string };
type Link = { fromRow: number; toRow: number; relationKey: string; evidence: string };
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const norm = (v: unknown) => typeof v === "string" || typeof v === "number" ?
  String(v).trim().toLocaleLowerCase() : "";
const referenceKeys = ["order_code", "product_code", "customer_code", "business_name", "product_name",
  "supplier_code", "supplier_name", "invoice_code", "code", "name"];
/** Recover only explicit foreign-key matches backed by a contiguous source passage.
 * This never creates schema, and never infers links from proximity alone. */
export function reconcilePreviewLinks(source: string, proposal: SchemaDiscoveryProposal,
  rawRows: unknown[], rawLinks: unknown[]): Link[] {
  const rows: Array<Row | null> = rawRows.map(v =>
    obj(v) && typeof v.entity === "string" && obj(v.values) &&
    typeof v.evidence === "string" ? v as Row : null);
  const links: Link[] = rawLinks.filter(obj).filter(v =>
    Number.isSafeInteger(v.fromRow) && Number.isSafeInteger(v.toRow) &&
    typeof v.relationKey === "string" && typeof v.evidence === "string") as Link[];
  const signatures = new Set(links.map(l => l.fromRow + ":" + l.toRow + ":" + l.relationKey));
  const anchor = (a: Row, b: Row): boolean => {
    for (const [ka, va] of Object.entries(a.values)) {
      for (const [kb, vb] of Object.entries(b.values)) {
        if (!referenceKeys.includes(ka) && !referenceKeys.includes(kb)) continue;
        if (ka === kb && ka === "name") continue;
        const x = norm(va), y = norm(vb);
        if (x && x === y && x.length >= 3 &&
          (ka.endsWith("_code") || kb.endsWith("_code") ||
            ka.endsWith("_name") || kb.endsWith("_name") ||
            (ka === "code" && kb.endsWith("_code")) ||
            (kb === "code" && ka.endsWith("_code")))) return true;
      }
    }
    return false;
  };
  // Require the exact child evidence to be within a clearly scoped parent section.
  const scopedEvidence = (a: Row, b: Row): string | null => {
    const first = source.indexOf(a.evidence), second = source.indexOf(b.evidence);
    if (first < 0 || second < 0) return null;
    const start = Math.min(first, second), end = Math.max(first + a.evidence.length, second + b.evidence.length);
    if (end - start > 650) return null;
    const passage = source.slice(start, end);
    if (!passage.includes(a.evidence) || !passage.includes(b.evidence)) return null;
    // Reject passages spanning a different order or invoice heading.
    const headings = passage.match(/(?:Pedido|Order|Factura|Invoice)\\s+[A-Z0-9-]+/gi) ?? [];
    if (new Set(headings.map(h => h.toLowerCase())).size > 1) return null;
    return passage;
  };
  for (const relation of proposal.relations) {
    for (let i = 0; i < rows.length; i++) {
      const from = rows[i];
      if (!from || from.entity !== relation.fromEntity) continue;
      for (let j = 0; j < rows.length; j++) {
        const to = rows[j];
        if (!to || to.entity !== relation.toEntity || i === j || !anchor(from, to)) continue;
        const signature = i + ":" + j + ":" + relation.key;
        if (signatures.has(signature)) continue;
        const evidence = scopedEvidence(from, to);
        if (!evidence) continue;
        links.push({ fromRow: i, toRow: j, relationKey: relation.key, evidence });
        signatures.add(signature);
      }
    }
  }
  return links.slice(0, 300);
}
