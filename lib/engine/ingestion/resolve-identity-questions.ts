import type { InsertPlan } from "./validate-insert-plan";
import { suggestIdentityQuestions, verifiedIdentityPairs } from "./suggest-identity-questions";

export type IdentityAnswer = "same" | "different" | "unsure";
export type IdentityAnswers = Record<string, IdentityAnswer>;

export function resolveIdentityQuestions(plan: InsertPlan, answers: IdentityAnswers): InsertPlan {
  const questions = suggestIdentityQuestions(plan);
  const allowed = new Set(questions.map(q => q.id));
  if (Object.keys(answers).some(key => !allowed.has(key)))
    throw new Error("Hay respuestas de identidad que no corresponden a la simulación.");
  if (questions.some(q => !["same", "different"].includes(answers[q.id])))
    throw new Error("Debes resolver todas las identidades antes de guardar.");
  const parent = new Map(plan.rows.map(row => [row.localId, row.localId]));
  const root = (id: string): string => {
    const p = parent.get(id);
    if (!p) throw new Error("Registro desconocido");
    return p === id ? id : root(p);
  };
  const different = questions.filter(q => answers[q.id] === "different");
  for (const q of [...verifiedIdentityPairs(plan), ...questions.filter(q => answers[q.id] === "same")]) {
    const a = root(q.leftLocalId), b = root(q.rightLocalId);
    if (a === b) continue;
    if (different.some(d => (root(d.leftLocalId) === a && root(d.rightLocalId) === b) ||
      (root(d.leftLocalId) === b && root(d.rightLocalId) === a)))
      throw new Error("Las respuestas sobre identidades son contradictorias.");
    parent.set(b, a);
  }
  for (const q of different)
    if (root(q.leftLocalId) === root(q.rightLocalId))
      throw new Error("Las respuestas sobre identidades son contradictorias.");
  const groups = new Map<string, typeof plan.rows>();
  for (const row of plan.rows) {
    const id = root(row.localId);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const rows: InsertPlan["rows"] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { rows.push(group[0]); continue; }
    // A confirmed identity is not permission to overwrite conflicting attributes.
    const preferred = [...group].sort((a, b) =>
      Object.values(b.values).filter(v => v !== null && v !== "").length -
      Object.values(a.values).filter(v => v !== null && v !== "").length)[0];
    const values = { ...preferred.values };
    for (const row of group) for (const [key, value] of Object.entries(row.values)) {
      if (value === null || value === "") continue;
      if (values[key] === undefined || values[key] === null || values[key] === "") {
        values[key] = value; continue;
      }
      if (["name", "nombre", "razon_social", "legal_name", "company_name", "business_name"].includes(key)) continue;
      if (String(values[key]).normalize("NFKC").trim().toLowerCase() !== String(value).normalize("NFKC").trim().toLowerCase())
        throw new Error("Misma entidad, pero hay datos diferentes en " + key + ". Se necesita revisión antes de fusionar.");
    }
    // The signed source evidence remains unchanged and independently verified.
    rows.push({ ...preferred, localId: root(group[0].localId), values });
  }
  const links = plan.links.map(link => ({
    ...link, fromLocalId: root(link.fromLocalId), toLocalId: root(link.toLocalId),
  })).filter((link, index, all) => all.findIndex(other =>
    other.relationKey === link.relationKey && other.fromLocalId === link.fromLocalId && other.toLocalId === link.toLocalId) === index);
  return { ...plan, rows, links };
}
