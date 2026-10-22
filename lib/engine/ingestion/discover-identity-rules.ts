import type { InsertPlan } from "./validate-insert-plan";
import type { EngineSnapshot, IdentityRules } from "./reconcile-engine-import";

export type IdentityProposal = {
  entityKey: string;
  keys: string[];
  status: "validated" | "review";
  reason: string;
};
export type IdentityDiscovery = { rules: IdentityRules; proposals: IdentityProposal[] };

// Only field *semantics* suggest candidates. Names alone never validate a key.
// Validation requires complete values, unique signatures in BOTH sets and
// nonempty existing history. All proposals are read-only and workspace-scoped.
const identifierField = (key: string): boolean =>
  /^(?:id|uuid|codigo(?:_[a-z0-9]+)?|referencia|ref|numero(?:_[a-z0-9]+)?|sku|external_id)$/.test(key);
const normalize = (v: unknown): string | null => {
  if (typeof v === "string") return v.normalize("NFKC").trim().toLocaleLowerCase("es") || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};
const sig = (values: Record<string, unknown>, keys: string[]): string | null => {
  const parts = keys.map(key => normalize(values[key]));
  return parts.every(value => value !== null) ? JSON.stringify(parts) : null;
};
const uniqueAndComplete = (rows: Array<{ values: Record<string, unknown> }>, keys: string[]) => {
  const signatures = rows.map(row => sig(row.values, keys));
  return signatures.every(Boolean) && new Set(signatures).size === signatures.length;
};
export function discoverIdentityRules(
  plan: InsertPlan, snapshot: EngineSnapshot, configured: IdentityRules,
): IdentityDiscovery {
  const rules: IdentityRules = { ...configured };
  const proposals: IdentityProposal[] = [];
  for (const entity of plan.entities) {
    const incoming = plan.rows.filter(row => row.entityKey === entity.key);
    const existing = snapshot.records.filter(row => row.entityKey === entity.key);
    if (configured[entity.key]?.length) {
      proposals.push({ entityKey: entity.key, keys: configured[entity.key],
        status: "validated", reason: "Clave única configurada en Engine; reconciliador comprueba colisiones" });
      continue;
    }
    const candidates = entity.fields.map(field => field.key).filter(identifierField);
    const validSingles = candidates.filter(key =>
      incoming.length > 0 && existing.length > 0 &&
      uniqueAndComplete(incoming, [key]) && uniqueAndComplete(existing, [key]));
    // A unique foreign-key-looking field in a multi-identifier entity is not
    // sufficient to identify its records (e.g. article reference in order lines).
    // Require a single identifier candidate, or one whose name identifies this entity.
    const ownIdentifier = (key: string) => key === "id" || key === "uuid" ||
      key === entity.key || key.startsWith(entity.key + "_") || key.endsWith("_" + entity.key);
    const safeSingles = candidates.length === 1 ? validSingles : validSingles.filter(ownIdentifier);
    if (safeSingles.length === 1) {
      const keys = [safeSingles[0]];
      rules[entity.key] = keys;
      proposals.push({ entityKey: entity.key, keys, status: "validated",
        reason: "Identificador inferido y unicidad comprobada en documento y Engine; solo simulación" });
      continue;
    }
    // Occam: use the smallest complete, collision-free composite supported by
    // both the incoming document and the existing workspace. It remains a
    // provisional simulation rule, never a database uniqueness constraint.
    const composite = candidates.length === 2 ? candidates : [];
    if (composite.length === 2 && incoming.length && existing.length &&
        uniqueAndComplete(incoming, composite) && uniqueAndComplete(existing, composite)) {
      rules[entity.key] = composite;
      proposals.push({ entityKey: entity.key, keys: composite, status: "validated",
        reason: "Clave compuesta mínima sin colisiones en documento ni Engine; hipótesis revisable si aparecen nuevos casos" });
      continue;
    }
    proposals.push({ entityKey: entity.key, keys: validSingles.length > 1 ? validSingles : (composite.length ? composite : candidates),
      status: "review", reason: !existing.length
        ? "Sin historial en Engine para validar identidad"
        : validSingles.length > 1
          ? "Varios identificadores posibles: requiere escoger una regla estable"
          : "Sin identificador simple único; posible clave compuesta requiere revisión" });
  }
  return { rules, proposals };
}
