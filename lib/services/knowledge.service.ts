// lib/services/knowledge.service.ts
import {
  createKnowledgeFile,
  createKnowledgeSource,
  getKnowledgeSourceById,
  getVisibleKnowledgeSources,
  updateKnowledgeSource,
} from "@/lib/repositories/knowledge.repository";

export async function listVisibleKnowledgeSources(userId: string) {
  return getVisibleKnowledgeSources(userId);
}

export async function findKnowledgeSource(id: string) {
  return getKnowledgeSourceById(id);
}

export async function newKnowledgeSource(data: {
  ownerUserId: string;
  title: string;
  description: string;
  visibility: string;
}) {
  return createKnowledgeSource(data);
}

export async function editKnowledgeSource(data: {
  id: string;
  ownerUserId: string;
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