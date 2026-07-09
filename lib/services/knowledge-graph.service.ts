// lib/services/knowledge-graph.service.ts
import { prisma } from "@/lib/prisma";

type GraphDocument = {
  id: string;
  title: string;
  knowledge_graph: {
    applications: unknown;
    products: unknown;
    regulations: unknown;
    dependencies: unknown;
  } | null;
};

function normalize(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase().trim())
    .filter(Boolean);
}

function scoreSimilarity(a: GraphDocument, b: GraphDocument) {
  const fields = [
    "applications",
    "products",
    "regulations",
    "dependencies",
  ] as const;

  let score = 0;

  for (const field of fields) {
    const left = new Set(normalize(a.knowledge_graph?.[field]));
    const right = normalize(b.knowledge_graph?.[field]);

    for (const value of right) {
      if (left.has(value)) {
        score++;
      }
    }
  }

  return score;
}

export async function updateKnowledgeRelationships(
  knowledgeSourceId: string,
) {
  const documents = await prisma.knowledge_sources.findMany({
    include: {
      knowledge_graph: true,
    },
  });

  const current = documents.find((d) => d.id === knowledgeSourceId);

  if (!current || !current.knowledge_graph) {
    return;
  }

  const related = documents
    .filter(
      (d) =>
        d.id !== current.id &&
        d.knowledge_graph,
    )
    .map((d) => ({
      title: d.title,
      relationship: "related",
      reason: "Coincidencia semántica",
      score: scoreSimilarity(current, d),
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ score, ...item }) => item);

  await prisma.knowledge_graph.update({
    where: {
      knowledge_source_id: knowledgeSourceId,
    },
    data: {
      related_documents: related,
      updated_at: new Date(),
    },
  });
}