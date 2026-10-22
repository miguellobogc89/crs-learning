import type { InsertPlan } from "./validate-insert-plan";

/** Read-only, conservative suggestions. Never merge entities from name similarity alone. */
export type IdentityQuestion = {
  id: string;
  entityKey: string;
  leftLocalId: string;
  rightLocalId: string;
  leftName: string;
  rightName: string;
  leftEvidence: string;
  rightEvidence: string;
  question: string;
};

const NAME_KEYS = ["name", "nombre", "razon_social", "legal_name", "company_name", "business_name"];
const NOISE = new Set(["sl", "sa", "slu", "srl", "sociedad", "limitada", "anonima", "empresa", "compania", "company", "the", "de", "del", "la", "el", "los", "las", "y"]);
function normalized(value: string): string[] {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/).filter(token => token.length > 1 && !NOISE.has(token));
}
function nameOf(values: Record<string, unknown>): string | null {
  for (const key of NAME_KEYS) if (typeof values[key] === "string" && (values[key] as string).trim())
    return (values[key] as string).trim();
  return null;
}
function candidateMatch(a: string, b: string): boolean {
  const aa = normalized(a), bb = normalized(b);
  if (!aa.length || !bb.length) return false;
  if (aa.join(" ") === bb.join(" ")) return true;
  const common = aa.filter(token => token.length >= 5 && bb.includes(token));
  // Require a distinctive shared token, plus substantial overlap.
  return common.length > 0 && common.length / Math.min(aa.length, bb.length) >= 0.75;
}
const ID_KEYS = ["tax_id", "taxid", "vat_id", "vat_number", "vat", "cif", "nif", "identificacion_fiscal", "fiscal_id", "registration_number"];
function fiscalIds(values: Record<string, unknown>): string[] {
  return ID_KEYS.flatMap(key => {
    const value = values[key];
    if (typeof value !== "string" && typeof value !== "number") return [];
    const id = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return id.length >= 7 ? [id] : [];
  });
}
export function sameVerifiedIdentity(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const left = fiscalIds(a), right = fiscalIds(b);
  return left.length > 0 && right.length > 0 && left.some(id => right.includes(id));
}
function contradictoryFiscalIdentity(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const left = fiscalIds(a), right = fiscalIds(b);
  return left.length > 0 && right.length > 0 && !left.some(id => right.includes(id));
}
export function verifiedIdentityPairs(plan: Pick<InsertPlan, "rows">): Array<{ leftLocalId: string; rightLocalId: string }> {
  const pairs: Array<{ leftLocalId: string; rightLocalId: string }> = [];
  for (let i = 0; i < plan.rows.length; i++)
    for (let j = i + 1; j < plan.rows.length; j++) {
      const a = plan.rows[i], b = plan.rows[j];
      if (a.entityKey === b.entityKey && sameVerifiedIdentity(a.values, b.values))
        pairs.push({ leftLocalId: a.localId, rightLocalId: b.localId });
    }
  return pairs;
}
export function suggestIdentityQuestions(plan: Pick<InsertPlan, "rows">): IdentityQuestion[] {
  const rows = plan.rows.map(row => ({ ...row, displayName: nameOf(row.values) }))
    .filter((row): row is typeof row & { displayName: string } => row.displayName !== null);
  const questions: IdentityQuestion[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.entityKey !== b.entityKey || !candidateMatch(a.displayName, b.displayName)) continue;
      // Verified fiscal identity is resolved without asking the user.
      if (sameVerifiedIdentity(a.values, b.values)) continue;
      const conflictingIds = contradictoryFiscalIdentity(a.values, b.values);
      questions.push({
        id: `identity:${a.localId}:${b.localId}`,
        entityKey: a.entityKey, leftLocalId: a.localId, rightLocalId: b.localId,
        leftName: a.displayName, rightName: b.displayName,
        leftEvidence: a.evidence.slice(0, 240), rightEvidence: b.evidence.slice(0, 240),
        question: conflictingIds
          ? `«${a.displayName}» y «${b.displayName}» tienen identificadores fiscales distintos. ¿Son realmente la misma entidad?`
          : `¿«${a.displayName}» y «${b.displayName}» son la misma entidad?`,
      });
      if (questions.length >= 25) return questions;
    }
  }
  return questions;
}
