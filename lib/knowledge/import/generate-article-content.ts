// lib/knowledge/import/generate-article-content.ts

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import { marked } from "marked";

import { ARTICLE_CONTENT_SYSTEM_PROMPT } from "./prompts/article-content-system-prompt";

export type GenerateArticleContentFile = {
  id: string;
  fileName: string;
  extractedText: string;
};

export type GenerateArticleContentInput = {
  title: string;
  description: string;

  /**
   * Para artículos nuevos debe ser null.
   *
   * Para actualizaciones contiene el contenido actual
   * que la IA deberá conservar, corregir y ampliar.
   */
  existingContent?: string | null;

  files: GenerateArticleContentFile[];
};

type GeneratedArticleContentResponse = {
  content: string;
};

const MAX_DOCUMENT_CHARACTERS = 70_000;
const MAX_EXISTING_CONTENT_CHARACTERS = 50_000;

const ARTICLE_CONTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["content"],
  properties: {
    content: {
      type: "string",
      minLength: 1,
    },
  },
} as const;

function truncateText(
  value: string,
  maximumCharacters: number,
) {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length <=
    maximumCharacters
  ) {
    return normalizedValue;
  }

  return [
    normalizedValue.slice(
      0,
      maximumCharacters,
    ),
    "",
    "[Contenido truncado por límite técnico]",
  ].join("\n");
}

function distributeDocumentCharacterLimit(
  files: GenerateArticleContentFile[],
) {
  if (files.length === 0) {
    return MAX_DOCUMENT_CHARACTERS;
  }

  return Math.max(
    8_000,
    Math.floor(
      MAX_DOCUMENT_CHARACTERS /
        files.length,
    ),
  );
}

function buildArticleContentPrompt({
  title,
  description,
  existingContent,
  files,
}: GenerateArticleContentInput) {
  const charactersPerDocument =
    distributeDocumentCharacterLimit(
      files,
    );

  const documentPayload = files.map(
    (file) => ({
      documentId: file.id,
      documentName: file.fileName,
      content: truncateText(
        file.extractedText,
        charactersPerDocument,
      ),
    }),
  );

  const normalizedExistingContent =
    existingContent?.trim();

  const sections: string[] = [
    "Genera el contenido completo del siguiente artículo de conocimiento.",
    "",
    "DATOS DEL ARTÍCULO:",
    "",
    JSON.stringify(
      {
        title,
        description,
        operation: normalizedExistingContent
          ? "update"
          : "create",
      },
      null,
      2,
    ),
  ];

  if (normalizedExistingContent) {
    sections.push(
      "",
      "CONTENIDO ACTUAL DEL ARTÍCULO:",
      "",
      truncateText(
        normalizedExistingContent,
        MAX_EXISTING_CONTENT_CHARACTERS,
      ),
    );
  }

  sections.push(
    "",
    "DOCUMENTOS QUE DEBEN INTEGRARSE:",
    "",
    JSON.stringify(
      documentPayload,
      null,
      2,
    ),
    "",
    "Devuelve el artículo completo y listo para almacenarse.",
  );

  return sections.join("\n");
}

async function normalizeGeneratedContent(
  content: string,
) {
  const normalizedContent =
    content.trim();

  if (!normalizedContent) {
    throw new Error(
      "La IA ha generado un artículo vacío",
    );
  }

  const containsHtml =
    /<(h2|h3|p|ul|ol|li|blockquote|table|pre|hr)\b/i.test(
      normalizedContent,
    );

  if (containsHtml) {
    return normalizedContent;
  }

  const markdownWithoutFence =
    normalizedContent
      .replace(
        /^```(?:html|markdown|md)?\s*/i,
        "",
      )
      .replace(
        /\s*```$/,
        "",
      )
      .trim();

  const htmlContent =
    await marked.parse(
      markdownWithoutFence,
    );

  const normalizedHtml =
    htmlContent.trim();

  if (!normalizedHtml) {
    throw new Error(
      "No se ha podido convertir el contenido generado a HTML",
    );
  }

  return normalizedHtml;
}

async function parseGeneratedContent(
  responseText: string,
) {
  if (!responseText.trim()) {
    throw new Error(
      "La IA no ha devuelto contenido para el artículo",
    );
  }

  let parsed:
    GeneratedArticleContentResponse;

  try {
    parsed =
      JSON.parse(
        responseText,
      ) as GeneratedArticleContentResponse;
  } catch {
    throw new Error(
      "La IA ha devuelto un formato inválido al generar el artículo",
    );
  }

  if (
    typeof parsed.content !==
    "string"
  ) {
    throw new Error(
      "La IA no ha devuelto contenido válido para el artículo",
    );
  }

  return normalizeGeneratedContent(
    parsed.content,
  );
}

export async function generateArticleContent(
  input: GenerateArticleContentInput,
) {
  if (!input.title.trim()) {
    throw new Error(
      "No se puede generar un artículo sin título",
    );
  }

  if (input.files.length === 0) {
    throw new Error(
      "No se puede generar un artículo sin documentos",
    );
  }

  const filesWithContent =
    input.files.filter(
      (file) =>
        file.extractedText.trim()
          .length > 0,
    );

  if (
    filesWithContent.length === 0
  ) {
    throw new Error(
      "Los documentos del artículo no contienen texto extraído",
    );
  }

  const openai =
    getOpenAIClient();

  const model =
    getKnowledgeImportModel();

  const response =
    await openai.responses.create({
      model,
      instructions:
        ARTICLE_CONTENT_SYSTEM_PROMPT,
      input:
        buildArticleContentPrompt({
          ...input,
          files:
            filesWithContent,
        }),
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_article_content",
          strict: true,
          schema:
            ARTICLE_CONTENT_JSON_SCHEMA,
        },
      },
    });

  return parseGeneratedContent(
    response.output_text,
  );
}
