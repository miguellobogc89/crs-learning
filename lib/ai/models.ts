// lib/ai/models.ts
import { getOpenAIModel, getKnowledgeImportModel } from "./openai";

/**
 * Resolve models on use, not at import time, so server runtime configuration
 * is authoritative and missing environment variables fail explicitly.
 */
export const AI_MODELS = {
  get KNOWLEDGE_ANALYSIS() {
    return getOpenAIModel();
  },
  get COURSE_GENERATION() {
    return getOpenAIModel();
  },
  get TEST_GENERATION() {
    return getOpenAIModel();
  },
  get CHAT() {
    return getOpenAIModel();
  },
  get KNOWLEDGE_IMPORT() {
    return getKnowledgeImportModel();
  },
} as const;
