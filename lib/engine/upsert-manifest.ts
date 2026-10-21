/**
 * Engine import contract, independent of Knowledge, document format and AI.
 *
 * Producers (document ingestion, integrations, CSV) emit observations.
 * The reconciler compares them against current Engine state and produces
 * a deterministic, inspectable plan. Only a separate authorized executor
 * may persist an approved plan.
 */
export type ImportFieldType =
  | "text" | "long_text" | "integer" | "decimal" | "boolean"
  | "date" | "datetime" | "enum";

export type ImportSource = {
  sourceId: string;
  kind: "knowledge" | "connector" | "manual";
  evidence?: string;
  locator?: string;
};

export type ImportEntity = {
  key: string;
  name: string;
  fields: { key: string; name: string; type: ImportFieldType }[];
  /** Identity keys must be explicitly provided by the producer, not guessed by the executor. */
  identityFields: string[];
};

export type ImportObservation = {
  localId: string;
  entityKey: string;
  values: Record<string, unknown>;
  source: ImportSource;
};

export type ImportLink = {
  fromLocalId: string;
  toLocalId: string;
  relationKey: string;
  source: ImportSource;
};

export type ImportManifest = {
  version: 1;
  workspaceId: string;
  entities: ImportEntity[];
  observations: ImportObservation[];
  links: ImportLink[];
};

export type ExistingEngineType = {
  id: string;
  key: string;
  fields: { key: string; type: string }[];
  records: { id: string; values: Record<string, unknown> }[];
};

export type UpsertOperation =
  | { action: "create_type"; entityKey: string }
  | { action: "add_field"; entityKey: string; fieldKey: string }
  | { action: "create"; localId: string; entityKey: string; values: Record<string, unknown> }
  | { action: "reuse"; localId: string; entityKey: string; recordId: string }
  | { action: "review"; localId: string; entityKey: string; reason: string }
  | { action: "link"; fromLocalId: string; toLocalId: string; relationKey: string };

export type UpsertPlan = {
  version: 1;
  workspaceId: string;
  operations: UpsertOperation[];
  summary: { create: number; reuse: number; review: number; link: number };
  writesPerformed: false;
};

const normalize = (value: unknown): string =>
  typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
    : JSON.stringify(value);

const validKey = (key: string) => /^[a-z][a-z0-9_]*$/.test(key) && key.length <= 80;

/**
 * Pure read-only reconciliation. Never treats a matching name as identity
 * unless the entity explicitly declares that field as an identity key.
 * Conflicting matches and ambiguous identities are held for review.
 */
export function planEngineUpsert(
  manifest: ImportManifest,
  existing: readonly ExistingEngineType[],
): UpsertPlan {
  if (manifest.version !== 1 || !manifest.workspaceId ||
      manifest.entities.length > 100 || manifest.observations.length > 500 ||
      manifest.links.length > 1000) {
    throw new Error("Invalid import manifest or batch limits exceeded.");
  }
  const operations: UpsertOperation[] = [];
  const types = new Map(existing.map(type => [type.key, type]));
  const entities = new Map<string, ImportEntity>();
  for (const entity of manifest.entities) {
    if (!validKey(entity.key) || entities.has(entity.key) ||
        !entity.fields.length || entity.fields.some(field => !validKey(field.key)) ||
        new Set(entity.fields.map(field => field.key)).size !== entity.fields.length ||
        entity.identityFields.some(key => !entity.fields.some(field => field.key === key))) {
      throw new Error("Invalid or duplicate entity definition.");
    }
    entities.set(entity.key, entity);
    const stored = types.get(entity.key);
    if (!stored) {
      operations.push({ action: "create_type", entityKey: entity.key });
      continue;
    }
    for (const field of entity.fields) {
      const current = stored.fields.find(item => item.key === field.key);
      if (!current) operations.push({ action: "add_field", entityKey: entity.key, fieldKey: field.key });
      else if (current.type !== field.type) throw new Error("Incompatible field: " + entity.key + "." + field.key);
    }
  }
  const ids = new Set<string>();
  const actionable = new Set<string>();
  for (const observation of manifest.observations) {
    if (!observation.localId || ids.has(observation.localId)) throw new Error("Duplicate observation ID.");
    ids.add(observation.localId);
    const entity = entities.get(observation.entityKey);
    if (!entity || !observation.source.sourceId || !observation.source.kind ||
        !observation.values || Array.isArray(observation.values) ||
        Object.keys(observation.values).some(key => !entity.fields.some(field => field.key === key))) {
      throw new Error("Invalid observation.");
    }
    const stored = types.get(entity.key);
    if (!stored) {
      operations.push({ action: "create", localId: observation.localId,
        entityKey: entity.key, values: observation.values });
      actionable.add(observation.localId);
      continue;
    }
    if (!entity.identityFields.length ||
        entity.identityFields.some(key => observation.values[key] === null ||
          observation.values[key] === undefined || observation.values[key] === "")) {
      operations.push({ action: "review", localId: observation.localId,
        entityKey: entity.key, reason: "No verified identity key." });
      continue;
    }
    const matches = stored.records.filter(record => entity.identityFields.every(key =>
      record.values[key] !== undefined &&
      normalize(record.values[key]) === normalize(observation.values[key])));
    if (matches.length > 1) {
      operations.push({ action: "review", localId: observation.localId,
        entityKey: entity.key, reason: "Ambiguous identity." });
    } else if (matches.length === 1) {
      const conflict = Object.entries(observation.values).some(([key, value]) =>
        matches[0].values[key] !== undefined &&
        normalize(matches[0].values[key]) !== normalize(value));
      if (conflict) operations.push({ action: "review", localId: observation.localId,
        entityKey: entity.key, reason: "Existing record has conflicting values." });
      else {
        operations.push({ action: "reuse", localId: observation.localId,
          entityKey: entity.key, recordId: matches[0].id });
        actionable.add(observation.localId);
      }
    } else {
      operations.push({ action: "create", localId: observation.localId,
        entityKey: entity.key, values: observation.values });
      actionable.add(observation.localId);
    }
  }
  for (const link of manifest.links) {
    if (!ids.has(link.fromLocalId) || !ids.has(link.toLocalId) || !validKey(link.relationKey))
      throw new Error("Invalid link endpoints.");
    if (actionable.has(link.fromLocalId) && actionable.has(link.toLocalId))
      operations.push({ action: "link", fromLocalId: link.fromLocalId,
        toLocalId: link.toLocalId, relationKey: link.relationKey });
  }
  return {
    version: 1, workspaceId: manifest.workspaceId, operations,
    summary: {
      create: operations.filter(op => op.action === "create").length,
      reuse: operations.filter(op => op.action === "reuse").length,
      review: operations.filter(op => op.action === "review").length,
      link: operations.filter(op => op.action === "link").length,
    },
    writesPerformed: false,
  };
}
