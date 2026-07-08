// lib/ai/assistant/retrieval.ts
import { prisma } from "@/lib/prisma";
import { listAccessibleKnowledgeSpaces } from "@/lib/services/knowledge-space.service";
import { listAccessibleKnowledgeLibraries } from "@/lib/services/knowledge-access.service";

export type RetrievedKnowledgeItem = {
  knowledgeSourceId: string;
  title: string;
  description: string | null;
  content: string;
  libraryId: string | null;
  libraryName: string | null;
  score: number;
};

export type RetrievedKnowledgeContext = {
  items: RetrievedKnowledgeItem[];
  contextText: string;
};

export async function retrieveKnowledge(
  userId: string,
  question: string,
): Promise<RetrievedKnowledgeContext> {
const spaces = await listAccessibleKnowledgeSpaces(userId);
const accessibleLibraries = await listAccessibleKnowledgeLibraries(userId);

const accessibleLibraryIds = new Set<string>();

for (const library of accessibleLibraries) {
  accessibleLibraryIds.add(library.id);
}

for (const space of spaces) {
  for (const item of space.knowledge_space_libraries) {
    accessibleLibraryIds.add(item.knowledge_libraries.id);
  }
}

  const keywords = extractKeywords(question);

  if (accessibleLibraryIds.size === 0 || keywords.length === 0) {
    return {
      items: [],
      contextText: "No se ha encontrado conocimiento accesible relevante.",
    };
  }

  const knowledgeSources = await prisma.knowledge_sources.findMany({
    where: {
      library_id: {
        in: Array.from(accessibleLibraryIds),
      },
      status: {
        not: "deleted",
      },
      OR: keywords.flatMap((keyword) => [
        {
          title: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          content: {
            contains: keyword,
            mode: "insensitive",
          },
        },
      ]),
    },
    take: 20,
    select: {
      id: true,
      title: true,
      description: true,
      content: true,
      library_id: true,
      knowledge_libraries: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const rankedItems = knowledgeSources
    .map((source) => {
      const searchableText = [
        source.title,
        source.description ?? "",
        source.content,
        source.knowledge_libraries?.name ?? "",
      ].join(" ");

      return {
        knowledgeSourceId: source.id,
        title: source.title,
        description: source.description,
        content: truncateText(source.content, 2500),
        libraryId: source.library_id,
        libraryName: source.knowledge_libraries?.name ?? null,
        score: scoreText(searchableText, keywords),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    items: rankedItems,
    contextText: buildContextText(rankedItems),
  };
}

function extractKeywords(text: string) {
  const stopWords = new Set([
    "a",
    "al",
    "algo",
    "como",
    "con",
    "cual",
    "cuando",
    "de",
    "del",
    "desde",
    "dime",
    "donde",
    "el",
    "en",
    "es",
    "esa",
    "ese",
    "eso",
    "esta",
    "este",
    "esto",
    "hay",
    "la",
    "las",
    "lo",
    "los",
    "me",
    "mi",
    "para",
    "por",
    "que",
    "qué",
    "se",
    "si",
    "sobre",
    "son",
    "su",
    "sus",
    "un",
    "una",
    "y",
  ]);

  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !stopWords.has(word))
    .slice(0, 12);
}

function scoreText(text: string, keywords: string[]) {
  const normalizedText = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let score = 0;

  for (const keyword of keywords) {
    if (normalizedText.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function buildContextText(items: RetrievedKnowledgeItem[]) {
  if (items.length === 0) {
    return "No se ha encontrado conocimiento accesible relevante.";
  }

  return items
    .map((item, index) => {
      return `
[Fuente ${index + 1}]
Título: ${item.title}
Biblioteca: ${item.libraryName ?? "Sin biblioteca"}
Descripción: ${item.description ?? "Sin descripción"}
Contenido:
${item.content}
`;
    })
    .join("\n---\n")
    .trim();
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}