// lib/knowledge/knowledge-types.ts
export const KNOWLEDGE_TYPES = [
  "unknown",
  "procedure",
  "process",
  "manual",
  "policy",
  "reference",
  "faq",
  "technical",
  "functional",
  "catalog",
] as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeType, string> = {
  unknown: "Detectar automáticamente",
  procedure: "Procedimiento",
  process: "Proceso",
  manual: "Manual",
  policy: "Política",
  reference: "Referencia",
  faq: "Preguntas frecuentes",
  technical: "Documentación técnica",
  functional: "Documentación funcional",
  catalog: "Catálogo",
};