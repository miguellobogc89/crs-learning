/**
 * Shared relational schema for a Knowledge → Engine preview.
 *
 * Discovery proposes an abstraction and carries NO quotes: an entity, field or
 * relation earns its place only when extracted, evidence-backed instances
 * support it (see support.ts) or when it already exists in the catalog.
 * Identity is declared once per entity, never chosen per record.
 */
import type { FieldType } from "./evidence";

export type Cardinality = "one_to_one" | "one_to_many" | "many_to_many";
export type Origin = "catalog" | "workspace" | "new";

export type PreviewField = {
  key: string; name: string; type: FieldType; required: boolean; description: string; origin: Origin;
};
export type PreviewEntity = {
  key: string; name: string; description: string;
  /** Field keys that identify one real-world record across documents. */
  identityFields: string[];
  /** Relation through which this entity belongs to its owner (lines, components…). */
  ownedBy: string | null;
  /**
   * Relation whose source record scopes identityFields (an invoice number is
   * unique per issuer). Owned entities are always scoped by their owner.
   */
  identityScope: string | null;
  fields: PreviewField[];
  origin: Origin;
};
export type PreviewRelation = {
  key: string; name: string; fromEntity: string; toEntity: string; cardinality: Cardinality; description: string;
  /** Every toEntity record must have exactly one link of this relation. */
  requiredForTarget: boolean;
  /** Several relations join the same pair: the role must be shown in the source. */
  roleEvidenceRequired: boolean;
  origin: Origin;
};
export type PreviewSchema = { entities: PreviewEntity[]; relations: PreviewRelation[]; warnings: string[] };

export type CatalogContext = {
  types: Array<{ key: string; name: string; origin: "catalog" | "workspace"; fields: Array<{ key: string; name: string; type: string }> }>;
  relations: Array<{ key: string; fromEntity: string; toEntity: string; cardinality: string }>;
};

export type SchemaIssue = { code: string; path: string; message: string };

/** Relation whose source record scopes this entity's identity, if any. */
export const identityParentRelation = (entity: Pick<PreviewEntity, "ownedBy" | "identityScope">) =>
  entity.ownedBy ?? entity.identityScope;

export const FIELD_TYPES: FieldType[] = ["text", "long_text", "integer", "decimal", "boolean", "date", "datetime", "enum"];
const CARDINALITIES: Cardinality[] = ["one_to_one", "one_to_many", "many_to_many"];
const KEY = /^[a-z][a-z0-9_]{0,62}$/;
const LIMITS = { entities: 30, fields: 60, relations: 60 };

const nullableString = { type: ["string", "null"] };

/** Structured Output for discovery. Mirrors validateDiscoveredSchema exactly. */
export const DISCOVERY_OUTPUT_FORMAT = {
  type: "json_schema" as const,
  name: "engine_preview_schema",
  strict: true as const,
  schema: {
    type: "object", additionalProperties: false,
    required: ["entities", "relations", "warnings"],
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["key", "name", "description", "identityFields", "identityScope", "ownedBy", "fields"],
          properties: {
            key: { type: "string" }, name: { type: "string" }, description: { type: "string" },
            identityFields: { type: "array", items: { type: "string" } },
            identityScope: nullableString,
            ownedBy: nullableString,
            fields: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                required: ["key", "name", "type", "required", "description"],
                properties: {
                  key: { type: "string" }, name: { type: "string" },
                  type: { type: "string", enum: FIELD_TYPES },
                  required: { type: "boolean" }, description: { type: "string" },
                },
              },
            },
          },
        },
      },
      relations: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["key", "name", "fromEntity", "toEntity", "cardinality", "description", "requiredForTarget"],
          properties: {
            key: { type: "string" }, name: { type: "string" },
            fromEntity: { type: "string" }, toEntity: { type: "string" },
            cardinality: { type: "string", enum: CARDINALITIES },
            description: { type: "string" }, requiredForTarget: { type: "boolean" },
          },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";

export function validateDiscoveredSchema(raw: unknown, catalog: CatalogContext):
  { schema: PreviewSchema | null; issues: SchemaIssue[] } {
  const issues: SchemaIssue[] = [];
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (!object(raw) || !Array.isArray(raw.entities) || !Array.isArray(raw.relations) || !Array.isArray(raw.warnings)) {
    issue("INVALID_SHAPE", "$", "La respuesta no tiene entidades, relaciones y avisos.");
    return { schema: null, issues };
  }
  if (raw.entities.length === 0) issue("EMPTY_SCHEMA", "$.entities", "No se ha propuesto ninguna tabla.");
  if (raw.entities.length > LIMITS.entities) issue("LIMIT_EXCEEDED", "$.entities", `Más de ${LIMITS.entities} tablas propuestas.`);
  if (raw.relations.length > LIMITS.relations) issue("LIMIT_EXCEEDED", "$.relations", `Más de ${LIMITS.relations} relaciones propuestas.`);

  const known = new Map(catalog.types.map(type => [type.key, type]));
  const entities: PreviewEntity[] = [];
  for (const [i, item] of raw.entities.entries()) {
    const path = `entities[${i}]`;
    if (!object(item) || !Array.isArray(item.fields) || !Array.isArray(item.identityFields)) {
      issue("INVALID_SHAPE", path, "Tabla con forma no válida."); continue;
    }
    const key = text(item.key);
    if (!KEY.test(key)) { issue("INVALID_KEY", path + ".key", `Clave de tabla no válida: «${key}».`); continue; }
    if (entities.some(entity => entity.key === key)) { issue("DUPLICATE_KEY", path + ".key", `Tabla repetida: ${key}.`); continue; }
    if (!text(item.name)) issue("MISSING_NAME", path + ".name", `La tabla ${key} no tiene nombre.`);
    if (item.fields.length > LIMITS.fields) issue("LIMIT_EXCEEDED", path + ".fields", `La tabla ${key} tiene demasiados campos.`);
    const existing = known.get(key);
    const fields: PreviewField[] = [];
    for (const [j, rawField] of item.fields.entries()) {
      const fieldPath = `${path}.fields[${j}]`;
      if (!object(rawField)) { issue("INVALID_SHAPE", fieldPath, "Campo con forma no válida."); continue; }
      const fieldKey = text(rawField.key), type = rawField.type as FieldType;
      if (!KEY.test(fieldKey)) { issue("INVALID_KEY", fieldPath + ".key", `Clave de campo no válida en ${key}: «${fieldKey}».`); continue; }
      if (fields.some(field => field.key === fieldKey)) { issue("DUPLICATE_KEY", fieldPath + ".key", `Campo repetido: ${key}.${fieldKey}.`); continue; }
      if (!FIELD_TYPES.includes(type)) { issue("INVALID_FIELD_TYPE", fieldPath + ".type", `Tipo no permitido en ${key}.${fieldKey}.`); continue; }
      const published = existing?.fields.find(field => field.key === fieldKey);
      if (published && published.type !== type)
        issue("INCOMPATIBLE_WITH_CATALOG", fieldPath + ".type",
          `${key}.${fieldKey} ya existe como ${published.type}; se propuso ${type}.`);
      fields.push({
        key: fieldKey, name: text(rawField.name) || fieldKey, type, required: rawField.required === true,
        description: text(rawField.description), origin: published ? existing!.origin : "new",
      });
    }
    const identityFields = [...new Set(item.identityFields.map(text))];
    if (!identityFields.length)
      issue("MISSING_IDENTITY", path + ".identityFields", `La tabla ${key} no declara cómo se identifica un registro.`);
    for (const identity of identityFields) {
      const field = fields.find(candidate => candidate.key === identity);
      if (!field) issue("UNKNOWN_IDENTITY_FIELD", path + ".identityFields", `${key} usa como identidad un campo inexistente: ${identity}.`);
      else if (field.type === "long_text" || field.type === "boolean")
        issue("WEAK_IDENTITY_FIELD", path + ".identityFields", `${key}.${identity} (${field.type}) no puede identificar registros.`);
    }
    entities.push({
      key, name: text(item.name) || key, description: text(item.description), identityFields,
      ownedBy: text(item.ownedBy) || null, identityScope: text(item.identityScope) || null,
      fields, origin: existing?.origin ?? "new",
    });
  }

  const byKey = new Map(entities.map(entity => [entity.key, entity]));
  const knownRelations = new Map(catalog.relations.map(relation => [relation.key, relation]));
  const relations: PreviewRelation[] = [];
  for (const [i, item] of raw.relations.entries()) {
    const path = `relations[${i}]`;
    if (!object(item)) { issue("INVALID_SHAPE", path, "Relación con forma no válida."); continue; }
    const key = text(item.key), fromEntity = text(item.fromEntity), toEntity = text(item.toEntity);
    const cardinality = item.cardinality as Cardinality;
    if (!KEY.test(key)) { issue("INVALID_KEY", path + ".key", `Clave de relación no válida: «${key}».`); continue; }
    if (relations.some(relation => relation.key === key)) { issue("DUPLICATE_KEY", path + ".key", `Relación repetida: ${key}.`); continue; }
    if (!byKey.has(fromEntity) || !byKey.has(toEntity)) { issue("UNKNOWN_ENTITY", path, `${key} une tablas que no existen (${fromEntity} → ${toEntity}).`); continue; }
    if (!CARDINALITIES.includes(cardinality)) { issue("INVALID_CARDINALITY", path + ".cardinality", `Cardinalidad no válida en ${key}.`); continue; }
    if (item.requiredForTarget === true && cardinality === "many_to_many")
      issue("INVALID_REQUIREMENT", path + ".requiredForTarget", `${key} es muchos a muchos; no puede exigir exactamente un vínculo.`);
    const published = knownRelations.get(key);
    if (published && (published.fromEntity !== fromEntity || published.toEntity !== toEntity || published.cardinality !== cardinality))
      issue("INCOMPATIBLE_WITH_CATALOG", path, `La relación ${key} ya existe con otro significado (${published.fromEntity} → ${published.toEntity}, ${published.cardinality}).`);
    relations.push({
      key, name: text(item.name) || key, fromEntity, toEntity, cardinality, description: text(item.description),
      requiredForTarget: item.requiredForTarget === true && cardinality !== "many_to_many",
      roleEvidenceRequired: false, origin: published ? "catalog" : "new",
    });
  }
  for (const relation of relations)
    relation.roleEvidenceRequired = relations.some(other => other !== relation &&
      other.fromEntity === relation.fromEntity && other.toEntity === relation.toEntity);

  for (const entity of entities) {
    if (!entity.ownedBy) continue;
    const owner = relations.find(relation => relation.key === entity.ownedBy);
    if (!owner || owner.toEntity !== entity.key || owner.fromEntity === entity.key || owner.cardinality === "many_to_many")
      issue("INVALID_OWNER", `entities.${entity.key}.ownedBy`,
        `${entity.key} debe pertenecer a su padre mediante una relación uno a muchos hacia ${entity.key}.`);
  }
  for (const entity of entities) {
    if (!entity.identityScope) continue;
    const scope = relations.find(relation => relation.key === entity.identityScope);
    if (!scope || scope.toEntity !== entity.key || scope.fromEntity === entity.key || scope.cardinality === "many_to_many")
      issue("INVALID_IDENTITY_SCOPE", `entities.${entity.key}.identityScope`,
        `La identidad de ${entity.key} solo puede depender de una relación uno a muchos hacia ${entity.key}.`);
    else if (entity.ownedBy && entity.ownedBy !== entity.identityScope)
      issue("INVALID_IDENTITY_SCOPE", `entities.${entity.key}.identityScope`,
        `${entity.key} pertenece a ${entity.ownedBy}; su identidad ya depende de ese registro.`);
  }
  // Identity chains (owner or scope) must end: a record cannot identify itself through itself.
  for (const entity of entities) {
    const seen = new Set<string>();
    let current: PreviewEntity | undefined = entity;
    while (current && identityParentRelation(current)) {
      if (seen.has(current.key)) { issue("IDENTITY_CYCLE", `entities.${entity.key}`, `La identidad de ${entity.key} depende de sí misma en cadena.`); break; }
      seen.add(current.key);
      const relation = relations.find(candidate => candidate.key === identityParentRelation(current!));
      current = relation ? byKey.get(relation.fromEntity) : undefined;
    }
  }

  const warnings = raw.warnings.filter((warning): warning is string => typeof warning === "string" && !!warning.trim()).map(w => w.trim());
  if (issues.length) return { schema: null, issues };
  return { schema: { entities, relations, warnings }, issues };
}

/** Structured Output for one document's extraction, derived from the shared schema. */
export function extractionOutputFormat(schema: PreviewSchema) {
  const fieldKeys = [...new Set(schema.entities.flatMap(entity => entity.fields.map(field => field.key)))];
  const relationKeys = schema.relations.map(relation => relation.key);
  const span = {
    type: "object", additionalProperties: false, required: ["line", "endLine", "text"],
    properties: { line: { type: "integer" }, endLine: { type: "integer" }, text: { type: "string" } },
  };
  return {
    type: "json_schema" as const,
    name: "engine_preview_extraction",
    strict: true as const,
    schema: {
      type: "object", additionalProperties: false, required: ["records", "links", "warnings"],
      properties: {
        records: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["ref", "entity", "fields"],
            properties: {
              ref: { type: "string" },
              entity: { type: "string", enum: schema.entities.map(entity => entity.key) },
              fields: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false, required: ["key", "value", "line", "endLine", "text"],
                  properties: {
                    key: { type: "string", enum: fieldKeys.length ? fieldKeys : ["none"] },
                    value: { type: "string" },
                    line: { type: "integer" }, endLine: { type: "integer" }, text: { type: "string" },
                  },
                },
              },
            },
          },
        },
        links: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["relation", "from", "to", "roleEvidence"],
            properties: {
              relation: { type: "string", enum: relationKeys.length ? relationKeys : ["none"] },
              from: { type: "string" }, to: { type: "string" },
              roleEvidence: { anyOf: [{ type: "null" }, span] },
            },
          },
        },
        warnings: { type: "array", items: { type: "string" } },
      },
    },
  };
}

/** Compact schema the extractor needs; no catalog chatter, no documents. */
export function schemaForExtraction(schema: PreviewSchema) {
  return {
    entities: schema.entities.map(entity => ({
      key: entity.key, name: entity.name, identityFields: entity.identityFields, identityScope: entity.identityScope, ownedBy: entity.ownedBy,
      fields: entity.fields.map(field => ({ key: field.key, type: field.type, required: field.required, description: field.description })),
    })),
    relations: schema.relations.map(relation => ({
      key: relation.key, fromEntity: relation.fromEntity, toEntity: relation.toEntity, cardinality: relation.cardinality,
      description: relation.description, requiredForTarget: relation.requiredForTarget,
      roleEvidenceRequired: relation.roleEvidenceRequired,
    })),
  };
}
