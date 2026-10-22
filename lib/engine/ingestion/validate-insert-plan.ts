/**
 * Server-side safety gate for an Engine import plan.
 * This validates the structural integrity of a proposed write, but does NOT
 * authorize persistence: DB identity checks and source verification must also pass.
 */
export type InsertPlan = {
  entities: Array<{ key: string; disposition: string; fields: Array<{ key: string; type: string; disposition: string }> }>;
  relations: Array<{ key: string; fromEntity: string; toEntity: string; cardinality: string; disposition: string }>;
  rows: Array<{ localId: string; entityKey: string; values: Record<string, unknown>; evidence: string; disposition: string }>;
  links: Array<{ fromLocalId: string; toLocalId: string; relationKey: string; evidence: string }>;
  unresolvedLinks: string[];
  issues: string[];
};

export function validateInsertPlan(plan: InsertPlan): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const keys = new Set<string>();
  const rowIds = new Set<string>();
  const relationKeys = new Set<string>();
  const entityMap = new Map(plan.entities.map(entity => [entity.key, entity]));
  const relationMap = new Map(plan.relations.map(relation => [relation.key, relation]));
  const rowMap = new Map(plan.rows.map(row => [row.localId, row]));
  if (!plan.entities.length || !plan.rows.length) blockers.push("La propuesta no contiene estructuras y registros.");
  for (const entity of plan.entities) {
    if (keys.has(entity.key)) blockers.push("Estructura duplicada: " + entity.key);
    keys.add(entity.key);
    if (!/^[a-z][a-z0-9_]*$/.test(entity.key)) blockers.push("Clave de estructura inválida: " + entity.key);
    const fields = new Set<string>();
    for (const field of entity.fields) {
      if (fields.has(field.key)) blockers.push("Campo duplicado: " + entity.key + "." + field.key);
      fields.add(field.key);
      if (field.disposition === "conflict") blockers.push("Campo incompatible: " + entity.key + "." + field.key);
    }
  }
  const validFieldTypes = new Set(["text", "integer", "decimal", "boolean", "date", "datetime", "json"]);
  for (const entity of plan.entities) {
    if (entity.disposition === "conflict") blockers.push("Estructura incompatible: " + entity.key);
    for (const field of entity.fields) {
      if (!/^[a-z][a-z0-9_]*$/.test(field.key))
        blockers.push("Clave de campo inválida: " + entity.key + "." + field.key);
      if (!validFieldTypes.has(field.type))
        blockers.push("Tipo de campo no permitido: " + entity.key + "." + field.key);
    }
  }
  for (const relation of plan.relations) {
    if (relationKeys.has(relation.key)) blockers.push("Relación duplicada: " + relation.key);
    relationKeys.add(relation.key);
    if (!entityMap.has(relation.fromEntity) || !entityMap.has(relation.toEntity))
      blockers.push("Relación con estructura desconocida: " + relation.key);
    if (relation.disposition === "conflict") blockers.push("Relación incompatible: " + relation.key);
    if (!/^[a-z][a-z0-9_]*$/.test(relation.key))
      blockers.push("Clave de relación inválida: " + relation.key);
    if (!["one_to_one", "one_to_many", "many_to_one", "many_to_many"].includes(relation.cardinality))
      blockers.push("Cardinalidad inválida: " + relation.key);
  }
  for (const row of plan.rows) {
    if (rowIds.has(row.localId)) blockers.push("Identificador local duplicado: " + row.localId);
    rowIds.add(row.localId);
    const entity = entityMap.get(row.entityKey);
    if (!entity) { blockers.push("Registro sin estructura: " + row.localId); continue; }
    if (row.disposition !== "candidate") blockers.push("Registro pendiente: " + row.localId);
    if (!row.evidence?.trim()) blockers.push("Registro sin evidencia: " + row.localId);
    if (!row.values || typeof row.values !== "object" || Array.isArray(row.values)) {
      blockers.push("Valores inválidos: " + row.localId); continue;
    }
    for (const field of Object.keys(row.values)) {
      const definition = entity.fields.find(item => item.key === field);
      if (!definition) {
        blockers.push("Campo no declarado: " + row.localId + "." + field);
        continue;
      }
      const value = row.values[field];
      if (value === null) continue;
      const valid = definition.type === "integer" ? typeof value === "number" && Number.isSafeInteger(value) :
        definition.type === "decimal" ? typeof value === "number" && Number.isFinite(value) :
        definition.type === "boolean" ? typeof value === "boolean" :
        definition.type === "json" ? typeof value === "object" :
        typeof value === "string" && value.trim().length > 0;
      if (!valid) blockers.push("Valor incompatible: " + row.localId + "." + field);
    }
  }
  const links = new Set<string>();
  for (const link of plan.links) {
    const from = rowMap.get(link.fromLocalId), to = rowMap.get(link.toLocalId);
    const relation = relationMap.get(link.relationKey);
    if (!from || !to || !relation || from.entityKey !== relation.fromEntity ||
      to.entityKey !== relation.toEntity || !link.evidence?.trim())
      blockers.push("Vínculo inválido: " + link.relationKey);
    const key = [link.relationKey, link.fromLocalId, link.toLocalId].join(":");
    if (links.has(key)) blockers.push("Vínculo duplicado: " + key);
    links.add(key);
  }
  if (plan.unresolvedLinks.length) blockers.push("Hay " + plan.unresolvedLinks.length + " relaciones sin resolver.");
  if (plan.issues.length) blockers.push("Hay " + plan.issues.length + " incidencias pendientes de revisión.");
  return { ready: blockers.length === 0, blockers };
}
