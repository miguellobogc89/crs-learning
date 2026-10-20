import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";

export class EngineProvenanceError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID", message: string) {
    super(message);
    this.name = "EngineProvenanceError";
  }
}

async function requireMembership(tx: Prisma.TransactionClient, organizationId: string, userId: string, write: boolean) {
  const member = await tx.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    select: { role: true, status: true, organizations: { select: { status: true } } },
  });
  if (!member || member.status !== "active" || member.organizations.status !== "active" ||
      (write && !["owner", "admin"].includes(member.role))) {
    throw new EngineProvenanceError("FORBIDDEN", "Insufficient organization permissions.");
  }
}

/** Returns evidence only when the caller can also read its linked knowledge source. */
export async function listEngineRecordProvenance(input: {
  organizationId: string;
  userId: string;
  recordId: string;
  revision?: number;
}) {
  return prisma.$transaction(async (tx) => {
    await requireMembership(tx, input.organizationId, input.userId, false);
    const record = await tx.engine_records.findFirst({
      where: { id: input.recordId, organization_id: input.organizationId },
      select: { id: true },
    });
    if (!record) throw new EngineProvenanceError("NOT_FOUND", "Record not found.");
    const items = await tx.engine_record_provenance.findMany({
      where: {
        organization_id: input.organizationId,
        record_id: record.id,
        ...(input.revision === undefined ? {} : { revision: input.revision }),
      },
      orderBy: { created_at: "desc" },
    });
    // Evidence may reference a source, a file, both, or neither (manual).
    // File-only evidence must be checked through its parent knowledge source.
    const sourceIds = [...new Set(items
      .map((item) => item.knowledge_source_id)
      .filter((id): id is string => id !== null))];
    const fileIds = [...new Set(items
      .map((item) => item.knowledge_file_id)
      .filter((id): id is string => id !== null))];

    const [allowedSources, allowedFiles] = await Promise.all([
      tx.knowledge_sources.findMany({
        where: {
          id: { in: sourceIds },
          AND: [knowledgeSourceReadWhere(input.userId)],
        },
        select: { id: true },
      }),
      tx.knowledge_files.findMany({
        where: {
          id: { in: fileIds },
          knowledge_sources: knowledgeSourceReadWhere(input.userId),
        },
        select: { id: true, knowledge_source_id: true },
      }),
    ]);

    const allowedSourceIds = new Set(allowedSources.map((source) => source.id));
    const allowedFileById = new Map(
      allowedFiles.map((file) => [file.id, file.knowledge_source_id]),
    );

    return items.filter((item) => {
      // When both references are present, verify they belong to the same
      // accessible source; never trust a mismatched provenance link.
      if (item.knowledge_source_id &&
          !allowedSourceIds.has(item.knowledge_source_id)) return false;
      if (item.knowledge_file_id) {
        const parentSourceId = allowedFileById.get(item.knowledge_file_id);
        if (!parentSourceId) return false;
        if (item.knowledge_source_id &&
            parentSourceId !== item.knowledge_source_id) return false;
      }
      return true; // Manual provenance with no document reference.
    });
  });
}

/** Attach manual provenance to an existing snapshot; document ingestion is a separate phase. */
export async function addEngineManualProvenance(input: {
  organizationId: string;
  userId: string;
  recordId: string;
  revision: number;
  fieldKey?: string;
  evidenceText?: string;
}) {
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new EngineProvenanceError("INVALID", "Revision must be a positive integer.");
  }
  if (input.fieldKey !== undefined && !/^[a-z][a-z0-9_]*$/.test(input.fieldKey)) {
    throw new EngineProvenanceError("INVALID", "Invalid field key.");
  }
  return prisma.$transaction(async (tx) => {
    await requireMembership(tx, input.organizationId, input.userId, true);
    const snapshot = await tx.engine_record_revisions.findFirst({
      where: {
        organization_id: input.organizationId,
        record_id: input.recordId,
        revision: input.revision,
      },
      select: { record_id: true, values_json: true },
    });
    if (!snapshot) throw new EngineProvenanceError("NOT_FOUND", "Record revision not found.");
    if (input.fieldKey !== undefined) {
      const values = snapshot.values_json;
      if (!values || typeof values !== "object" || Array.isArray(values) ||
          !Object.prototype.hasOwnProperty.call(values, input.fieldKey)) {
        throw new EngineProvenanceError("INVALID", "Field not present in revision.");
      }
    }
    return tx.engine_record_provenance.create({
      data: {
        organization_id: input.organizationId,
        record_id: input.recordId,
        revision: input.revision,
        field_key: input.fieldKey ?? null,
        origin_type: "manual",
        evidence_text: input.evidenceText?.trim() || null,
        created_by_user_id: input.userId,
      },
    });
  });
}
