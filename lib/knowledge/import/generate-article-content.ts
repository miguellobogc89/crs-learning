// lib/knowledge/import/generate-article-content.ts

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import type { KnowledgeFileCanonicalAnalysis } from "@/lib/knowledge/file-analysis/types";
import {
  buildCompactCanonicalArticleModel,
  type CompactCanonicalArticleModel,
} from "@/lib/knowledge/file-analysis/article-content-projection";
import { marked } from "marked";

import { ARTICLE_CONTENT_SYSTEM_PROMPT } from "./prompts/article-content-system-prompt";

export type GenerateArticleContentFile = {
  id: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  extractedText: string;
  canonicalAnalysis?: KnowledgeFileCanonicalAnalysis | null;
  analysisSchemaVersion?: number | null;
  analysisStatus?: string | null;
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

type ArticleContentDocumentPayload = {
  documentId: string;
  documentName: string;
  fileType: string | null;
  fileSize: number | null;
  analysisStatus: string | null;
  analysisSchemaVersion: number | null;
  content: string;
  canonicalModel: CompactCanonicalArticleModel | null;
};

const MAX_DOCUMENT_CHARACTERS = 70_000;
const MAX_EXISTING_CONTENT_CHARACTERS = 50_000;
const MAX_CANONICAL_MODEL_CHARACTERS = 45_000;

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

function limitCanonicalModel(
  model: CompactCanonicalArticleModel | null,
) {
  if (!model) {
    return null;
  }

  const serialized = JSON.stringify(model);

  if (
    serialized.length <=
    MAX_CANONICAL_MODEL_CHARACTERS
  ) {
    return model;
  }

  return {
    ...model,
    visualModel: {
      ...model.visualModel,
      pages: model.visualModel.pages.map((page) => ({
        ...page,
        elements: page.elements.slice(0, 30),
        connections: page.connections.slice(0, 30),
        groups: page.groups.slice(0, 20),
      })),
    },
    semanticModel: {
      ...model.semanticModel,
      nodes: model.semanticModel.nodes.slice(0, 40),
      edges: model.semanticModel.edges.slice(0, 40),
      steps: model.semanticModel.steps.slice(0, 40),
      decisions:
        model.semanticModel.decisions.slice(0, 40),
      evidence:
        model.semanticModel.evidence.slice(0, 60),
    },
    metadata: {
      ...model.metadata,
      limitations: [
        ...model.metadata.limitations,
        "Proyeccion canonica recortada por limite tecnico del prompt.",
      ],
    },
  };
}

function buildDocumentPayload(
  file: GenerateArticleContentFile,
  charactersPerDocument: number,
): ArticleContentDocumentPayload {
  const compactCanonicalModel =
    file.canonicalAnalysis
      ? limitCanonicalModel(
          buildCompactCanonicalArticleModel(
            file.canonicalAnalysis,
          ),
        )
      : null;

  return {
    documentId: file.id,
    documentName: file.fileName,
    fileType: file.fileType ?? null,
    fileSize: file.fileSize ?? null,
    analysisStatus: file.analysisStatus ?? null,
    analysisSchemaVersion:
      file.analysisSchemaVersion ?? null,
    content: truncateText(
      file.extractedText,
      charactersPerDocument,
    ),
    canonicalModel: compactCanonicalModel,
  };
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

  const documentPayload = files.map((file) =>
    buildDocumentPayload(
      file,
      charactersPerDocument,
    ),
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
    "Cada documento puede incluir canonicalModel, una proyeccion compacta del modelo canonico persistido en knowledge_file_analysis.analysis_json. Usa ese modelo como fuente intermedia objetiva cuando exista; si canonicalModel es null, usa el texto extraido como fallback.",
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
  files: GenerateArticleContentFile[],
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
    return ensureRequiredMermaid(
      normalizeChecklistHtml(normalizedContent),
      files,
    );
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

  return ensureRequiredMermaid(
    normalizeChecklistHtml(normalizedHtml),
    files,
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTaskItemHtml(
  text: string,
  checked: boolean,
) {
  return [
    `<li data-type="taskItem" data-checked="${checked ? "true" : "false"}">`,
    `<label><input type="checkbox"${checked ? " checked" : ""}><span></span></label>`,
    `<div><p>${escapeHtml(text)}</p></div>`,
    "</li>",
  ].join("");
}

function normalizeChecklistHtml(html: string) {
  const taskItemPattern =
    /<li\b([^>]*)data-type=["']taskItem["']([^>]*)>([\s\S]*?)<\/li>/gi;

  const normalizedTaskItems = html.replace(
    taskItemPattern,
    (match, beforeAttributes: string, afterAttributes: string, innerHtml: string) => {
      if (
        /<label\b/i.test(innerHtml) &&
        /<input\b[^>]*type=["']checkbox["']/i.test(innerHtml) &&
        /<div\b/i.test(innerHtml)
      ) {
        return match;
      }

      const checked =
        /data-checked=["']true["']/i.test(
          `${beforeAttributes} ${afterAttributes}`,
        ) || /☑/.test(innerHtml);
      const text = innerHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/[☐☑•]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return buildTaskItemHtml(text, checked);
    },
  );

  return normalizePlainCheckboxParagraphs(
    normalizePlainCheckboxLists(normalizedTaskItems),
  );
}

function normalizePlainCheckboxLists(html: string) {
  const listPattern = /<ul\b(?![^>]*data-type=["']taskList["'])[^>]*>([\s\S]*?)<\/ul>/gi;

  return html.replace(listPattern, (match, innerHtml: string) => {
    const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    const items = Array.from(innerHtml.matchAll(itemPattern));

    if (items.length === 0) {
      return match;
    }

    const taskItems = items
      .map((item) => {
        const rawText = item[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const checkboxMatch = rawText.match(/^[•\-\s]*(☐|☑)\s*(.+)$/);

        if (!checkboxMatch) {
          return null;
        }

        return buildTaskItemHtml(
          checkboxMatch[2].trim(),
          checkboxMatch[1] === "☑",
        );
      });

    if (taskItems.some((item) => item === null)) {
      return match;
    }

    return `<ul data-type="taskList">${taskItems.join("")}</ul>`;
  });
}

function normalizePlainCheckboxParagraphs(html: string) {
  const paragraphPattern =
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = Array.from(
    html.matchAll(paragraphPattern),
  );

  if (paragraphs.length === 0) {
    return html;
  }

  let output = "";
  let cursor = 0;
  let index = 0;

  while (index < paragraphs.length) {
    const match = paragraphs[index];
    const rawText = match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const checkboxMatch = rawText.match(
      /^[•\-\s]*(☐|☑)\s*(.*)$/,
    );

    if (!checkboxMatch) {
      index += 1;
      continue;
    }

    const tasks: string[] = [];
    const groupStart = match.index ?? cursor;

    while (index < paragraphs.length) {
      const current = paragraphs[index];
      const currentText = current[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const currentCheckbox = currentText.match(
        /^[•\-\s]*(☐|☑)\s*(.*)$/,
      );

      if (!currentCheckbox) {
        break;
      }

      let taskText = currentCheckbox[2].trim();
      const checked = currentCheckbox[1] === "☑";

      if (!taskText && paragraphs[index + 1]) {
        const next = paragraphs[index + 1];
        const nextText = next[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/[•]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (
          nextText &&
          !/^[☐☑]/.test(nextText)
        ) {
          taskText = nextText;
          index += 1;
        }
      }

      if (taskText) {
        tasks.push(
          buildTaskItemHtml(taskText, checked),
        );
      }

      index += 1;
    }

    if (tasks.length === 0) {
      index += 1;
      continue;
    }

    const groupEndMatch = paragraphs[index - 1];
    const groupEnd =
      (groupEndMatch.index ?? groupStart) +
      groupEndMatch[0].length;

    output += html.slice(cursor, groupStart);
    output += `<ul data-type="taskList">${tasks.join("")}</ul>`;
    cursor = groupEnd;
  }

  if (cursor === 0) {
    return html;
  }

  return output + html.slice(cursor);
}

function hasMermaid(html: string) {
  return (
    /<pre>\s*<code[^>]*class=["'][^"']*language-mermaid/i.test(html) ||
    /data-type=["']mermaid-diagram["']/i.test(html)
  );
}

function normalizeMermaidNodeId(value: string) {
  return `N${value
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 24)}`;
}

function shortenMermaidLabel(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/["[\]{}<>]/g, "")
    .trim();

  if (normalized.length <= 48) {
    return normalized;
  }

  return `${normalized.slice(0, 45).trim()}...`;
}

function escapeMermaidLabel(value: string) {
  return shortenMermaidLabel(value).replace(/"/g, "'");
}

function getMermaidShape(label: string) {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("inicio") ||
    normalized.includes("fin") ||
    normalized.includes("cierre")
  ) {
    return "terminator";
  }

  if (
    normalized.includes("?") ||
    normalized.includes("decision") ||
    normalized.startsWith("si ") ||
    normalized.includes("validar") ||
    normalized.includes("confirmar")
  ) {
    return "decision";
  }

  return "process";
}

function renderMermaidNode(id: string, label: string) {
  const safeLabel = escapeMermaidLabel(label);
  const shape = getMermaidShape(label);

  if (shape === "decision") {
    return `${id}{"${safeLabel}"}`;
  }

  if (shape === "terminator") {
    return `${id}(["${safeLabel}"])`;
  }

  return `${id}["${safeLabel}"]`;
}

function getEdgeLabel(label: string) {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\b(si|yes|aprobado|correcto|ok)\b/.test(normalized)) {
    return "Sí";
  }

  if (/\b(no|rechazado|incorrecto|ko|incidencia)\b/.test(normalized)) {
    return "No";
  }

  return null;
}

function buildMermaidFromCanonicalModel(
  model: CompactCanonicalArticleModel,
) {
  const entityMap = new Map<string, string>();
  const semanticEntities = [
    ...model.semanticModel.steps,
    ...model.semanticModel.decisions,
    ...model.semanticModel.processes,
    ...model.semanticModel.nodes,
  ];

  for (const entity of semanticEntities) {
    if (!entityMap.has(entity.id)) {
      entityMap.set(entity.id, entity.label);
    }
  }

  const lines: string[] = [];
  const nodeIds = new Map<string, string>();
  const nodeDefinitions = new Map<string, string>();
  const edgeLines: string[] = [];
  let decisionCount = 0;

  function ensureNode(sourceId: string, label: string) {
    const existing = nodeIds.get(sourceId);

    if (existing) {
      return existing;
    }

    const nodeId = normalizeMermaidNodeId(
      sourceId || label,
    );
    nodeIds.set(sourceId, nodeId);
    nodeDefinitions.set(
      nodeId,
      `  ${renderMermaidNode(nodeId, label)}`,
    );

    if (getMermaidShape(label) === "decision") {
      decisionCount += 1;
    }

    return nodeId;
  }

  for (const edge of model.semanticModel.edges) {
    const fromLabel = entityMap.get(edge.from);
    const toLabel = entityMap.get(edge.to);

    if (!fromLabel || !toLabel) {
      continue;
    }

    const from = ensureNode(edge.from, fromLabel);
    const to = ensureNode(edge.to, toLabel);
    const edgeLabel = getEdgeLabel(edge.label);

    edgeLines.push(
      edgeLabel
        ? `  ${from} -->|${edgeLabel}| ${to}`
        : `  ${from} --> ${to}`,
    );
  }

  if (edgeLines.length < 2) {
    for (const page of model.visualModel.pages) {
      const elements = new Map(
        page.elements
          .filter((element) => element.text)
          .map((element) => [
            element.id,
            element.text ?? element.name ?? element.id,
          ]),
      );

      for (const connection of page.connections) {
        if (
          !connection.startElementId ||
          !connection.endElementId
        ) {
          continue;
        }

        const fromLabel = elements.get(
          connection.startElementId,
        );
        const toLabel = elements.get(
          connection.endElementId,
        );

        if (!fromLabel || !toLabel) {
          continue;
        }

        const from = ensureNode(
          connection.startElementId,
          fromLabel,
        );
        const to = ensureNode(
          connection.endElementId,
          toLabel,
        );
        const edgeLabel = connection.text
          ? getEdgeLabel(connection.text)
          : null;

        edgeLines.push(
          edgeLabel
            ? `  ${from} -->|${edgeLabel}| ${to}`
            : `  ${from} --> ${to}`,
        );
      }
    }
  }

  if (
    edgeLines.length < 2 ||
    nodeDefinitions.size < 3
  ) {
    return null;
  }

  const shouldUseVerticalLayout =
    nodeDefinitions.size > 6 ||
    edgeLines.length > 6 ||
    decisionCount > 1;

  lines.push(
    shouldUseVerticalLayout
      ? "flowchart TD"
      : "flowchart LR",
  );
  lines.push(...nodeDefinitions.values());
  lines.push(...Array.from(new Set(edgeLines)));

  return lines.join("\n");
}

function buildRequiredMermaid(files: GenerateArticleContentFile[]) {
  for (const file of files) {
    if (!file.canonicalAnalysis) {
      continue;
    }

    const model = limitCanonicalModel(
      buildCompactCanonicalArticleModel(
        file.canonicalAnalysis,
      ),
    );

    if (!model) {
      continue;
    }

    const hasFlowEvidence =
      model.semanticModel.edges.length >= 2 ||
      model.semanticModel.decisions.length > 0 &&
        model.semanticModel.steps.length >= 2 ||
      model.visualModel.pages.some(
        (page) => page.connections.length >= 2,
      );

    if (!hasFlowEvidence) {
      continue;
    }

    const diagram = buildMermaidFromCanonicalModel(model);

    if (diagram) {
      return diagram;
    }
  }

  return null;
}

function ensureRequiredMermaid(
  html: string,
  files: GenerateArticleContentFile[],
) {
  if (hasMermaid(html)) {
    return html;
  }

  const diagram = buildRequiredMermaid(files);

  if (!diagram) {
    return html;
  }

  const mermaidBlock = [
    "<h2>Flujo del proceso</h2>",
    `<pre><code class="language-mermaid">${escapeHtml(diagram)}</code></pre>`,
  ].join("\n");

  const firstHeadingMatch = html.match(/<h2\b[^>]*>/i);

  if (!firstHeadingMatch?.index) {
    return `${mermaidBlock}\n${html}`;
  }

  return [
    html.slice(0, firstHeadingMatch.index),
    mermaidBlock,
    html.slice(firstHeadingMatch.index),
  ].join("\n");
}

async function parseGeneratedContent(
  responseText: string,
  files: GenerateArticleContentFile[],
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
    files,
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
          .length > 0 ||
        file.canonicalAnalysis !== null &&
          file.canonicalAnalysis !== undefined,
    );

  if (
    filesWithContent.length === 0
  ) {
    throw new Error(
      "Los documentos del artículo no contienen texto extraído ni modelo canónico válido",
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
    filesWithContent,
  );
}
