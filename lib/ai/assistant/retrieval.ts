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

type KnowledgeChunk = {
  knowledgeSourceId: string;
  title: string;
  description: string | null;
  libraryId: string | null;
  libraryName: string | null;
  content: string;
  score: number;
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

  if (keywords.length === 0) {
    return emptyResult();
  }

  const knowledgeSources = await prisma.knowledge_sources.findMany({
    where: {
      status: {
        not: "deleted",
      },
      OR: [
        {
          owner_user_id: userId,
        },
        {
          library_id: {
            in: Array.from(accessibleLibraryIds),
          },
        },
      ],
    },
    take: 80,
    select: {
      id: true,
      title: true,
      description: true,
      content: true,
      library_id: true,
      knowledge_files: {
        select: {
          file_name: true,
          extracted_text: true,
        },
      },
      knowledge_analysis: {
        select: {
          analysis_json: true,
        },
      },
      knowledge_libraries: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const chunks: KnowledgeChunk[] = [];

  for (const source of knowledgeSources) {
    const analysisText = source.knowledge_analysis?.analysis_json
      ? JSON.stringify(source.knowledge_analysis.analysis_json, null, 2)
      : "";

    const sourceHeader = [
      `Título: ${source.title}`,
      `Descripción: ${source.description ?? "Sin descripción"}`,
      `Biblioteca: ${source.knowledge_libraries?.name ?? "Sin biblioteca"}`,
    ].join("\n");

    const analysisChunks = splitIntoChunks(analysisText, 1800);

    for (const chunk of analysisChunks) {
      chunks.push({
        knowledgeSourceId: source.id,
        title: source.title,
        description: source.description,
        libraryId: source.library_id,
        libraryName: source.knowledge_libraries?.name ?? null,
        content: `${sourceHeader}\n\nTipo: Análisis IA\n\n${chunk}`,
        score: scoreText(`${sourceHeader}\n${chunk}`, keywords) + 3,
      });
    }

    const manualChunks = splitIntoChunks(source.content ?? "", 1200);

    for (const chunk of manualChunks) {
      chunks.push({
        knowledgeSourceId: source.id,
        title: source.title,
        description: source.description,
        libraryId: source.library_id,
        libraryName: source.knowledge_libraries?.name ?? null,
        content: `${sourceHeader}\n\nTipo: Contenido manual\n\n${chunk}`,
        score: scoreText(`${sourceHeader}\n${chunk}`, keywords) + 2,
      });
    }

    for (const file of source.knowledge_files) {
      const fileChunks = splitIntoChunks(file.extracted_text ?? "", 1800);

      for (const chunk of fileChunks) {
        chunks.push({
          knowledgeSourceId: source.id,
          title: source.title,
          description: source.description,
          libraryId: source.library_id,
          libraryName: source.knowledge_libraries?.name ?? null,
          content: `${sourceHeader}\n\nTipo: Texto extraído\nArchivo: ${file.file_name}\n\n${chunk}`,
          score: scoreText(`${sourceHeader}\n${file.file_name}\n${chunk}`, keywords),
        });
      }
    }
  }

  const rankedItems = chunks
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((chunk) => ({
      knowledgeSourceId: chunk.knowledgeSourceId,
      title: chunk.title,
      description: chunk.description,
      content: chunk.content,
      libraryId: chunk.libraryId,
      libraryName: chunk.libraryName,
      score: chunk.score,
    }));

  if (rankedItems.length === 0) {
    return emptyResult();
  }

  return {
    items: rankedItems,
    contextText: buildContextText(rankedItems),
  };
}

function emptyResult(): RetrievedKnowledgeContext {
  return {
    items: [],
    contextText: "No se ha encontrado conocimiento accesible relevante.",
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

  return normalizeText(text)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !stopWords.has(word))
    .slice(0, 14);
}

function scoreText(text: string, keywords: string[]) {
  const normalizedText = normalizeText(text);

  let score = 0;

  for (const keyword of keywords) {
    if (normalizedText.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/gi, " ");
}

function splitIntoChunks(text: string, maxLength: number) {
  const cleanText = text.trim();

  if (!cleanText) {
    return [];
  }

  const paragraphs = cleanText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }

    const sliced = sliceLongText(paragraph, maxLength);
    chunks.push(...sliced);
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function sliceLongText(text: string, maxLength: number) {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }

  return chunks;
}

function buildContextText(items: RetrievedKnowledgeItem[]) {
  return items
    .map((item, index) => {
      return `
[Fragmento ${index + 1}]
Título: ${item.title}
Biblioteca: ${item.libraryName ?? "Sin biblioteca"}
Score: ${item.score}

${item.content}
`;
    })
    .join("\n---\n")
    .trim();
}