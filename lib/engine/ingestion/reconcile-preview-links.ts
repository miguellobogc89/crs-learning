import type { SchemaDiscoveryProposal } from "../schema-discovery/validation";

type Row = { entity: string; values: Record<string, unknown>; evidence: string };
type Link = { fromRow: number; toRow: number; relationKey: string; evidence: string };
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const norm = (v: unknown) => typeof v === "string" || typeof v === "number" ?
  String(v).normalize("NFKC").trim().toLocaleLowerCase() : "";
const identifier = (field: string) => /(^|_)(code|id|ref|sku|number)$/.test(field);
const descriptor = (field: string) => /(^|_)(name|title|label)$/.test(field);
const base = (field: string) => field.replace(/^(recipient|customer|business|client|item|product|article|order|invoice|supplier)_/, "");
/** Matches only explicit shared identifiers or meaningful names, never numeric amounts. */
const matches = (from: Row, to: Row) => {
  for (const [leftKey, leftValue] of Object.entries(from.values)) {
    for (const [rightKey, rightValue] of Object.entries(to.values)) {
      const left = norm(leftValue), right = norm(rightValue);
      if (!left || left !== right || left.length < 3) continue;
      if (identifier(leftKey) && identifier(rightKey) &&
          (base(leftKey) === base(rightKey) || leftKey === "code" || rightKey === "code" ||
            leftKey === "ref" || rightKey === "ref" ||
            (leftKey === "number" && rightKey.endsWith("_number")) ||
            (rightKey === "number" && leftKey.endsWith("_number")))) return true;
      if (descriptor(leftKey) && descriptor(rightKey)) return true;
    }
  }
  return false;
};
/** Resolve a named identity when a labelled evidence fragment is contained in
 * a parent record. A generic heading cannot establish this relationship. */
const labelledIdentity = (from: Row, to: Row): boolean => {
  if (!to.evidence.includes(from.evidence)) return false;
  const identities = Object.entries(from.values)
    .filter(([field, value]) => (identifier(field) || descriptor(field)) && norm(value).length >= 3)
    .map(([, value]) => norm(value));
  if (!identities.length) return false;
  return from.evidence.split(/[|\n]/).some(part => {
    const labelled = part.match(/^\s*[^:\n|]{2,60}:\s*(.+?)\s*$/);
    return labelled !== null && identities.includes(norm(labelled[1]));
  });
};
const evidenceFor = (source: string, from: Row, to: Row): string | null => {
  if (!source.includes(from.evidence) || !source.includes(to.evidence)) return null;
  // A source-backed parent section can contain the child evidence verbatim.
  if (from.evidence.includes(to.evidence) && from.evidence.length <= 1200) return from.evidence;
  if (to.evidence.includes(from.evidence) && to.evidence.length <= 1200) return to.evidence;
  // Repeated product names may occur in multiple lines; anchor the link to the
  // specific line's evidence when it contains the shared identifying name.
  if (to.evidence.length <= 300 &&
      Object.values(from.values).some(value => norm(value).length >= 4 &&
        to.evidence.toLocaleLowerCase().includes(norm(value)))) return to.evidence;
  if (from.evidence.length <= 300 &&
      Object.values(to.values).some(value => norm(value).length >= 4 &&
        from.evidence.toLocaleLowerCase().includes(norm(value)))) return from.evidence;
  return null;
};
/** Reconcile links only when endpoints share an explicit identity and the source
 * contains a contiguous proof. AI suggestions cannot bypass this check. */
export function reconcilePreviewLinks(source: string, proposal: SchemaDiscoveryProposal,
  rawRows: unknown[], _rawLinks: unknown[]): Link[] {
  const rows: Array<Row | null> = rawRows.map(v =>
    obj(v) && typeof v.entity === "string" && obj(v.values) &&
    typeof v.evidence === "string" ? v as Row : null);
  const links: Link[] = [];
  for (const relation of proposal.relations) {
    for (let i = 0; i < rows.length; i++) {
      const from = rows[i];
      if (!from || from.entity !== relation.fromEntity) continue;
      for (let j = 0; j < rows.length; j++) {
        const to = rows[j];
        if (!to || to.entity !== relation.toEntity || i === j || !(matches(from, to) || labelledIdentity(from, to))) continue;
        const evidence = evidenceFor(source, from, to);
        if (evidence) links.push({ fromRow: i, toRow: j, relationKey: relation.key, evidence });
        if (links.length >= 300) return links;
      }
    }
  }
  return links;
}
