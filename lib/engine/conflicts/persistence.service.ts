import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { validateValueConflicts, type ValueConflictCandidate } from "./validation";

/**
 * Stable identity for the same conflicting alternatives regardless of order.
 * Different evidence versions are preserved in the stored alternatives_json.
 */
export function valueConflictFingerprint(conflict: ValueConflictCandidate): string {
  const identity = [
    conflict.subject.trim().toLocaleLowerCase("en"),
    conflict.attribute.trim().toLocaleLowerCase("en"),
    conflict.context.trim().toLocaleLowerCase("en"),
    [...conflict.alternatives].map((a) => a.value.trim()).sort(),
  ];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

/**
 * Explicit, permission-checked persistence step.
 * Only validated evidence from accessible Knowledge documents is stored.
 * Never writes Engine records or resolves a pending conflict.
 * Requires sql/engine/004_value_conflicts.sql and regenerated Prisma client.
 */
export async function persistReviewedValueConflictCandidates(input: {
  workspaceId: string;
  userId: string;
  candidates: ValueConflictCandidate[];
}) {
  if (!input.workspaceId || !input.userId || !Array.isArray(input.candidates) ||
      input.candidates.length > 50) {
    throw new Error("Invalid conflict persistence request.");
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
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (workspace.owner_user_id !== input.userId &&
        !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Workspace owner or admin required to persist conflicts.");
    }
    const fileIds = [...new Set(input.candidates.flatMap((candidate) =>
      candidate.alternatives.flatMap((alternative) =>
        alternative.evidence.map((e) => e.documentId))))];
    const files = await tx.knowledge_files.findMany({
      where: {
        id: { in: fileIds },
        status: "ready",
        knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId),
      },
      select: { id: true, extracted_text: true },
    });
    if (files.length !== fileIds.length) {
      throw new Error("Some conflict evidence documents are inaccessible.");
    }
    const validation = validateValueConflicts({
      workspaceId: input.workspaceId,
      documents: files.map((file) => ({
        id: file.id, workspaceId: input.workspaceId, extractedText: file.extracted_text,
      })),
      candidates: input.candidates,
    });
    if (!validation.valid) {
      throw new Error("Invalid conflict evidence: " + JSON.stringify(validation.issues));
    }
    const stored = [];
    for (const conflict of validation.conflicts) {
      const fingerprint = valueConflictFingerprint(conflict);
      // Do not update resolved/dismissed decisions or overwrite original evidence.
      const record = await tx.engine_value_conflicts.upsert({
        where: { workspace_id_fingerprint: { workspace_id: input.workspaceId, fingerprint } },
        create: {
          workspace_id: input.workspaceId,
          fingerprint,
          subject: conflict.subject,
          attribute: conflict.attribute,
          context: conflict.context,
          alternatives_json: conflict.alternatives as unknown as Prisma.InputJsonArray,
          status: "pending_review",
          scope: "affected_value_only",
          detected_by: "ai",
        },
        update: {},
      });
      stored.push({ id: record.id, status: record.status, fingerprint });
    }
    return { stored, count: stored.length };
  });
}

/**
 * Consumer-safe read boundary. Callers must surface pending alternatives and
 * must not treat them as a confirmed single value.
 */
export async function listPendingValueConflicts(input: {
  workspaceId: string;
  userId: string;
  take?: number;
}) {
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
    if (!workspace || (workspace.owner_user_id !== input.userId &&
        workspace.workspace_members.length === 0)) {
      throw new Error("Workspace membership required.");
    }
    const take = Number.isFinite(input.take) ? Math.min(100, Math.max(1, Math.trunc(input.take!))) : 50;
    return tx.engine_value_conflicts.findMany({
      where: { workspace_id: input.workspaceId, status: "pending_review" },
      orderBy: { created_at: "desc" },
      take,
    });
  });
}
