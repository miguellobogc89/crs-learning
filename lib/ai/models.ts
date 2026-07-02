// lib/ai/models.ts
export const AI_MODELS = {
  KNOWLEDGE_ANALYSIS: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",

  COURSE_GENERATION: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",

  TEST_GENERATION: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",

  CHAT: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
} as const;