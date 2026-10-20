import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import {
  validateTypedEngineImport,
  type EngineImportObjectDefinition,
} from "./import-typed-validation";
import type { EngineImportCandidate } from "./import-preflight";

/**
 * Read-only bridge between persisted Knowledge documents and the Data Engine.
 * The caller supplies only IDs and proposed facts; source text and schemas
 * are always fetched from the database under workspace authorization.
 *
 * This does not create records, publish facts or invoke an AI model.
 */
export async function previewEngineImportFromKnowledge(input: {
  workspaceId: string;
  userId: string;
  knowledgeFileIds: string[];
  candidates: EngineImportCandidate[];
}) {
  if (!input.workspaceId || !input.userId) {
    throw new Error("Workspace and user are required.");
  }
  if (input.knowledgeFileIds.length > 100 || input.candidates.length > 500) {
    throw new Error("Import preview exceeds batch limits.");
  }
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspaces.findFirst({
      where: { id: input.workspaceId, status: "active" },
      select: {
        owner_user_id: true,
        workspace_members: {
          where: { user_id: input.userId, status: "active" },
          select: { role: true },
        },
      },
    });
    const isOwner = workspace?.owner_user_id === input.userId;
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (!isOwner && !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Workspace owner or admin required for import preview.");
    }

    const [files, objectTypes] = await Promise.all([
      tx.knowledge_files.findMany({
        where: {
          id: { in: input.knowledgeFileIds },
          status: { in: ["ready", "processed"] },
          knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId),
        },
        select: { id: true, extracted_text: true },
      }),
      tx.engine_object_types.findMany({
        where: { workspace_id: input.workspaceId },
        include: { engine_field_definitions: true },
      }),
    ]);

    const found = new Set(files.map((file) => file.id));
    if (new Set(input.knowledgeFileIds).size !== found.size) {
      throw new Error("One or more Knowledge files are inaccessible or not ready.");
    }

    const definitions: EngineImportObjectDefinition[] = objectTypes.map((objectType) => ({
      id: objectType.id,
      workspaceId: objectType.workspace_id,
      status: objectType.status,
      fields: objectType.engine_field_definitions.map((field) => ({
        key: field.key,
        field_type: field.field_type,
        is_required: field.is_required,
        is_unique: field.is_unique,
        status: field.status,
        configuration: field.configuration,
      })),
    }));

    return validateTypedEngineImport({
      workspaceId: input.workspaceId,
      documents: files.map((file) => ({
        id: file.id,
        workspaceId: input.workspaceId,
        extractedText: file.extracted_text,
      })),
      definitions,
      candidates: input.candidates,
    });
  });
}
