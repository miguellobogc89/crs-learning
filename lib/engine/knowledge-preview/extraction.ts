/**
 * Deterministic verification of one document's extraction.
 *
 * Nothing here repairs a model answer. A value that fails its own evidence is
 * reported and left out; the document is then marked for review so the user
 * sees exactly what was rejected and why.
 */
import { checkValue, identityToken, resolveSpan, type ResolvedSpan, type SegmentBounds, type TypedValue } from "./evidence";
import type { PreviewSchema } from "./schema";

export type ExtractedValue = { value: TypedValue; written: string; evidence: ResolvedSpan };
export type ExtractedRecord = { ref: string; entity: string; values: Record<string, ExtractedValue>; identityComplete: boolean };
export type ExtractedLink = { relation: string; from: string; to: string; roleEvidence: ResolvedSpan | null };
export type DocumentIssue = { code: string; message: string; path: string; severity: "error" | "warning" };
export type SegmentExtraction = {
  records: ExtractedRecord[];
  links: ExtractedLink[];
  issues: DocumentIssue[];
  warnings: string[];
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const SPAN_MESSAGES: Record<string, string> = {
  INVALID_LINES: "las líneas citadas no son válidas",
  LINES_OUTSIDE_DOCUMENT: "las líneas citadas están fuera de este documento",
  SPAN_TOO_LONG: "la cita abarca demasiadas líneas",
  EMPTY_EVIDENCE: "no se ha citado ningún texto",
  TEXT_NOT_IN_LINES: "el texto citado no aparece en esas líneas",
};
const VALUE_MESSAGES: Record<string, string> = {
  INVALID_CANONICAL_VALUE: "el valor no tiene el formato esperado para su tipo",
  VALUE_NOT_IN_EVIDENCE: "el valor no aparece en su propia cita",
};

export function validateSegmentExtraction(
  raw: unknown,
  schema: PreviewSchema,
  lines: readonly string[],
  bounds: SegmentBounds,
): SegmentExtraction {
  const issues: DocumentIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ code, path, message, severity: "error" });
  const records: ExtractedRecord[] = [];
  const links: ExtractedLink[] = [];
  if (!object(raw) || !Array.isArray(raw.records) || !Array.isArray(raw.links) || !Array.isArray(raw.warnings)) {
    error("INVALID_SHAPE", "$", "La respuesta del modelo no tiene registros, vínculos y avisos.");
    return { records, links, issues, warnings: [] };
  }
  const warnings = raw.warnings.filter((w): w is string => typeof w === "string" && !!w.trim()).map(w => w.trim());
  const entities = new Map(schema.entities.map(entity => [entity.key, entity]));
  const relations = new Map(schema.relations.map(relation => [relation.key, relation]));

  for (const [i, item] of raw.records.entries()) {
    const path = `records[${i}]`;
    if (!object(item) || typeof item.ref !== "string" || !item.ref.trim() || typeof item.entity !== "string" || !Array.isArray(item.fields)) {
      error("INVALID_SHAPE", path, "Registro con forma no válida."); continue;
    }
    const ref = item.ref.trim();
    if (records.some(record => record.ref === ref)) { error("DUPLICATE_REF", path, `La referencia ${ref} está repetida.`); continue; }
    const entity = entities.get(item.entity);
    if (!entity) { error("UNKNOWN_ENTITY", path, `La tabla ${item.entity} no está en el esquema.`); continue; }
    const values: Record<string, ExtractedValue> = {};
    for (const [j, field] of item.fields.entries()) {
      const fieldPath = `${path}.fields[${j}]`;
      if (!object(field) || typeof field.key !== "string" || typeof field.value !== "string") {
        error("INVALID_SHAPE", fieldPath, "Valor con forma no válida."); continue;
      }
      const definition = entity.fields.find(candidate => candidate.key === field.key);
      if (!definition) { error("FIELD_NOT_IN_ENTITY", fieldPath, `${entity.name}: el campo ${field.key} no pertenece a esta tabla.`); continue; }
      if (values[field.key]) { error("DUPLICATE_FIELD", fieldPath, `${entity.name} ${ref}: ${definition.name} aparece dos veces.`); continue; }
      const span = resolveSpan(lines, bounds, {
        line: Number(field.line), endLine: Number(field.endLine), text: typeof field.text === "string" ? field.text : "",
      });
      if (!span.ok) {
        error(span.code, fieldPath, `${entity.name} ${ref} · ${definition.name}: ${SPAN_MESSAGES[span.code]} (líneas ${field.line}–${field.endLine}).`);
        continue;
      }
      const checked = checkValue(definition.type, field.value, span.span.text);
      if (!checked.ok) {
        error(checked.code, fieldPath, `${entity.name} ${ref} · ${definition.name}: ${VALUE_MESSAGES[checked.code]} («${field.value}» frente a «${span.span.text}»).`);
        continue;
      }
      values[field.key] = { value: checked.value, written: field.value, evidence: span.span };
    }
    if (!Object.keys(values).length) { error("EMPTY_RECORD", path, `${entity.name} ${ref}: ningún valor verificado.`); continue; }
    for (const field of entity.fields.filter(candidate => candidate.required && !values[candidate.key]))
      error("MISSING_REQUIRED", path, `${entity.name} ${ref}: falta ${field.name}, que es obligatorio.`);
    const identityComplete = entity.identityFields.every(key => values[key] && identityToken(values[key].value));
    if (!identityComplete)
      error("MISSING_IDENTITY", path, `${entity.name} ${ref}: falta ${entity.identityFields.filter(key => !values[key]).join(", ") || "la identidad"}, necesario para identificarlo.`);
    records.push({ ref, entity: entity.key, values, identityComplete });
  }

  const byRef = new Map(records.map(record => [record.ref, record]));
  for (const [i, item] of raw.links.entries()) {
    const path = `links[${i}]`;
    if (!object(item) || typeof item.relation !== "string" || typeof item.from !== "string" || typeof item.to !== "string") {
      error("INVALID_SHAPE", path, "Vínculo con forma no válida."); continue;
    }
    const relation = relations.get(item.relation);
    if (!relation) { error("UNKNOWN_RELATION", path, `La relación ${item.relation} no está en el esquema.`); continue; }
    const from = byRef.get(item.from.trim()), to = byRef.get(item.to.trim());
    if (!from || !to) { error("UNKNOWN_REF", path, `${relation.name}: une registros que no se han verificado (${item.from} → ${item.to}).`); continue; }
    if (from.entity !== relation.fromEntity || to.entity !== relation.toEntity) {
      error("LINK_ENTITY_MISMATCH", path, `${relation.name} debe unir ${relation.fromEntity} → ${relation.toEntity}, no ${from.entity} → ${to.entity}.`); continue;
    }
    let roleEvidence: ResolvedSpan | null = null;
    if (object(item.roleEvidence)) {
      const span = resolveSpan(lines, bounds, {
        line: Number(item.roleEvidence.line), endLine: Number(item.roleEvidence.endLine),
        text: typeof item.roleEvidence.text === "string" ? item.roleEvidence.text : "",
      });
      if (!span.ok) { error(span.code, path, `${relation.name} (${from.ref} → ${to.ref}): ${SPAN_MESSAGES[span.code]}.`); continue; }
      roleEvidence = span.span;
    }
    if (relation.roleEvidenceRequired && !roleEvidence) {
      error("MISSING_ROLE_EVIDENCE", path, `${relation.name} (${from.ref} → ${to.ref}): falta la cita que muestra el rol.`); continue;
    }
    if (links.some(link => link.relation === relation.key && link.from === from.ref && link.to === to.ref)) {
      error("DUPLICATE_LINK", path, `${relation.name} (${from.ref} → ${to.ref}) está repetido.`); continue;
    }
    links.push({ relation: relation.key, from: from.ref, to: to.ref, roleEvidence });
  }

  for (const relation of schema.relations) {
    const own = links.filter(link => link.relation === relation.key);
    if (relation.cardinality !== "many_to_many") {
      for (const target of new Set(own.map(link => link.to)))
        if (own.filter(link => link.to === target).length > 1)
          error("CARDINALITY", `relations.${relation.key}`, `${relation.name}: ${target} tiene más de un origen y la relación lo impide.`);
    }
    if (relation.cardinality === "one_to_one") {
      for (const source of new Set(own.map(link => link.from)))
        if (own.filter(link => link.from === source).length > 1)
          error("CARDINALITY", `relations.${relation.key}`, `${relation.name}: ${source} tiene más de un destino y la relación es uno a uno.`);
    }
    if (relation.requiredForTarget) {
      for (const record of records.filter(candidate => candidate.entity === relation.toEntity))
        if (own.filter(link => link.to === record.ref).length !== 1)
          error("MISSING_REQUIRED_LINK", `relations.${relation.key}`, `${record.ref}: necesita exactamente un vínculo ${relation.name}.`);
    }
  }
  for (const record of records) {
    const entity = entities.get(record.entity)!;
    if (entity.ownedBy && links.filter(link => link.relation === entity.ownedBy && link.to === record.ref).length !== 1)
      error("MISSING_OWNER", `records.${record.ref}`, `${entity.name} ${record.ref}: debe pertenecer a un único registro mediante ${entity.ownedBy}.`);
    else if (!entity.ownedBy && entity.identityScope &&
      links.filter(link => link.relation === entity.identityScope && link.to === record.ref).length !== 1)
      error("MISSING_IDENTITY_SCOPE", `records.${record.ref}`,
        `${entity.name} ${record.ref}: su identidad depende de ${relations.get(entity.identityScope)?.name ?? entity.identityScope} y no tiene ese vínculo.`);
  }
  // The same real record cannot play two roles over one target (e.g. issuer and customer of one invoice).
  for (const record of records) {
    const roles = links.filter(link => link.to === record.ref && relations.get(link.relation)!.roleEvidenceRequired);
    for (let a = 0; a < roles.length; a++) for (let b = a + 1; b < roles.length; b++) {
      if (roles[a].relation === roles[b].relation) continue;
      const left = byRef.get(roles[a].from)!, right = byRef.get(roles[b].from)!;
      const sameIdentity = left.identityComplete && right.identityComplete &&
        recordIdentity(schema, left) === recordIdentity(schema, right);
      if (left.ref === right.ref || sameIdentity)
        error("SAME_RECORD_TWO_ROLES", `records.${record.ref}`,
          `${record.ref}: el mismo registro figura como ${relations.get(roles[a].relation)!.name} y como ${relations.get(roles[b].relation)!.name}.`);
    }
  }
  if (!records.length) error("NO_RECORDS", "$", "No se ha extraído ningún registro verificable de este documento.");
  return { records, links, issues, warnings };
}

/** Identity of a top-level record; owned records are scoped by reconcile.ts. */
export function recordIdentity(schema: PreviewSchema, record: ExtractedRecord): string | null {
  const entity = schema.entities.find(candidate => candidate.key === record.entity);
  if (!entity || !record.identityComplete) return null;
  return entity.key + ":" + entity.identityFields.map(key => key + "=" + identityToken(record.values[key].value)).join("|");
}
