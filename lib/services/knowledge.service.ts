// lib/services/knowledge.service.ts
import {
  createKnowledgeFile,
  createKnowledgeSource,
  getAccessibleKnowledgeSourceById,
  getKnowledgeSourceById,
  getVisibleKnowledgeSources,
  updateKnowledgeSource,
  getKnowledgeEvents,
} from "@/lib/repositories/knowledge.repository";

export async function listVisibleKnowledgeSources(
  userId: string,
  workspaceId: string,
) {
  return getVisibleKnowledgeSources(userId, workspaceId);
}

export async function findKnowledgeSource(id: string) {
  return getKnowledgeSourceById(id);
}

export async function findAccessibleKnowledgeSource(
  id: string,
  userId: string,
  workspaceId: string,
) {
  return getAccessibleKnowledgeSourceById(
    id,
    userId,
    workspaceId,
  );
}

export async function newKnowledgeSource(data: {
  ownerUserId: string;
  title: string;
  description: string;
  visibility: string;
  libraryId: string;
}) {
  return createKnowledgeSource(data);
}

export async function editKnowledgeSource(data: {
  id: string;
  ownerUserId: string;
  workspaceId: string;
  updatedByUserId: string;
  title: string;
  description: string;
  visibility: string;
  knowledgeType: string;
  content: string;
}) {
  return updateKnowledgeSource(data);
}

export async function addKnowledgeFile(data: {
  knowledgeSourceId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  extractedText: string;
}) {
  return createKnowledgeFile(data);
}

export async function listKnowledgeEvents(
  userId: string,
  workspaceId: string,
) {
  return getKnowledgeEvents(userId, workspaceId);
}
