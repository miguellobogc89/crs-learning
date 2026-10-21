import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "./validation";
import {
  planEngineUpsert,
  type ImportManifest,
  type ExistingEngineType,
} from "./upsert-manifest";

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalize = (value: unknown) => typeof value === "string"
  ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
  : JSON.stringify(value);

/**
 * Authorized, transactional draft import for EXISTING schemas.
 * Never applies inferred schema changes, overwrites, publishes or approves links.
 * Replans under a transaction to prevent stale caller-supplied decisions.
 * No AI or document-specific logic belongs here.
 */
export async function executeEngineUpsertManifest(input: {
  workspaceId: string;
  userId: string;
  manifest: ImportManifest;
}) {
  const { workspaceId, userId, manifest } = input;
  if (manifest.workspaceId !== workspaceId || !userId) throw new Error("Invalid workspace scope.");
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspaces.findFirst({
      where: { id: workspaceId, status: "active" },
      select: { owner_user_id: true, workspace_members: {
        where: { user_id: userId, status: "active" }, select: { role: true },
      } },
    });
    if (!workspace || (workspace.owner_user_id !== userId &&
        !["owner", "admin"].includes(workspace.workspace_members[0]?.role ?? ""))) {
      throw new Error("Workspace administrator required.");
    }

    const types = await tx.engine_object_types.findMany({
      where: { workspace_id: workspaceId, status: "active",
        key: { in: manifest.entities.map(entity => entity.key) } },
      include: { engine_field_definitions: { where: { status: "active" } } },
    });
    const records = await tx.engine_records.findMany({
      where: { workspace_id: workspaceId,
        object_type_id: { in: types.map(type => type.id) } },
      select: { id: true, object_type_id: true, values_json: true },
    });
    const existing: ExistingEngineType[] = types.map(type => ({
      id: type.id, key: type.key,
      fields: type.engine_field_definitions.map(field => ({
        key: field.key, type: field.field_type,
      })),
      records: records.filter(record => record.object_type_id === type.id)
        .filter(record => isObject(record.values_json))
        .map(record => ({ id: record.id, values: record.values_json as Record<string, unknown> })),
    }));
    const plan = planEngineUpsert(manifest, existing);
    // Fail closed: schema and relationship changes require a dedicated,
    // reviewed schema/relation workflow. No partial write.
    if (plan.operations.some(operation =>
      operation.action === "create_type" || operation.action === "add_field")) {
      throw new Error("Schema changes require a separate approved workflow.");
    }
    const typeByKey = new Map(types.map(type => [type.key, type]));
    const observationById = new Map(manifest.observations.map(item => [item.localId, item]));
    const created: string[] = [];
    const reused: string[] = [];
    const pending: { localId: string; reason: string }[] = [];
    const resolved = new Map<string, string>();
    for (const operation of plan.operations) {
      if (operation.action === "review") {
        pending.push({ localId: operation.localId, reason: operation.reason });
        continue;
      }
      if (operation.action === "link") {
        pending.push({ localId: operation.fromLocalId,
          reason: "Relationship requires approved relation workflow: " + operation.relationKey });
        continue;
      }
      if (operation.action === "reuse") {
        resolved.set(operation.localId, operation.recordId);
        reused.push(operation.localId);
        continue;
      }
      if (operation.action !== "create") continue;
      const observation = observationById.get(operation.localId);
      const type = typeByKey.get(operation.entityKey);
      if (!observation || !type) throw new Error("Invalid import plan.");
      if (type.engine_field_definitions.some(field =>
        field.is_unique || ["entity_reference", "record_reference"].includes(field.field_type))) {
        pending.push({ localId: operation.localId, reason: "Unsupported unique or reference field." });
        continue;
      }
      const checked = validateEngineRecordValues(operation.values, type.engine_field_definitions);
      if (!checked.ok) {
        pending.push({ localId: operation.localId, reason: "Invalid field values." });
        continue;
      }
      const entity = manifest.entities.find(item => item.key === operation.entityKey);
      if (!entity || !entity.identityFields.length) {
        pending.push({ localId: operation.localId, reason: "Missing declared identity." });
        continue;
      }
      // Cross-document stable key; source ID deliberately excluded.
      const identity = entity.identityFields.map(key => operation.values[key]);
      if (identity.some(value => value === null || value === undefined || value === "")) {
        pending.push({ localId: operation.localId, reason: "Incomplete declared identity." });
        continue;
      }
      const key = "upsert:" + createHash("sha256").update(JSON.stringify([
        workspaceId, type.id, identity.map(normalize),
      ])).digest("hex");
      // Unique external key prevents identical concurrent inserts.
      const prior = await tx.engine_records.findFirst({
        where: { workspace_id: workspaceId, object_type_id: type.id, external_key: key },
        select: { id: true },
      });
      const row = await tx.engine_records.upsert({
        where: { object_type_id_external_key: { object_type_id: type.id, external_key: key } },
        create: { workspace_id: workspaceId, object_type_id: type.id,
          external_key: key, status: "draft", schema_version: type.schema_version,
          values_json: checked.values as Prisma.InputJsonObject,
          created_by_user_id: userId, updated_by_user_id: userId },
        update: {},
        select: { id: true, values_json: true },
      });
      if (!isObject(row.values_json) || Object.entries(checked.values).some(([field, value]) =>
        row.values_json && isObject(row.values_json) &&
        normalize(row.values_json[field]) !== normalize(value))) {
        throw new Error("Concurrent identity conflict; transaction rolled back.");
      }
      resolved.set(operation.localId, row.id);
      if (prior) reused.push(operation.localId);
      else created.push(operation.localId);
    }
    return { status: pending.length ? "completed_with_issues" : "completed",
      created, reused, pending, resolvedCount: resolved.size,
      writesPerformed: created.length > 0 };
  });
}
