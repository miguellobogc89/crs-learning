// lib/knowledge/file-analysis/analyze-file.ts

import crypto from "crypto";
import path from "path";
import { readFile } from "fs/promises";
import type { Prisma } from "@prisma/client";
import { parseOffice } from "officeparser";

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import {
  isPlainTextKnowledgeDocument,
  isSupportedKnowledgeDocument,
} from "@/lib/knowledge/import-flow";

import {
  extractPptxVisualModel,
  extractTextFromVisualModel,
} from "./pptx-extractor";
import {
  KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION,
  KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
  type KnowledgeFileCanonicalAnalysis,
  type KnowledgeFileAnalysisMetadata,
  type KnowledgeFileAnalysisResult,
  type KnowledgeFileSemanticModel,
  type KnowledgeFileVisualModel,
} from "./types";

type KnowledgeFileForAnalysis = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  extracted_text: string;
};

type SemanticResponse = {
  semanticModel: KnowledgeFileSemanticModel;
};

type ResponseUsageShape = {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
  };
};

const EMPTY_SEMANTIC_MODEL: KnowledgeFileSemanticModel = {
  nodes: [],
  edges: [],
  lanes: [],
  owners: [],
  systems: [],
  processes: [],
  steps: [],
  decisions: [],
  inputs: [],
  outputs: [],
  conditions: [],
  exceptions: [],
  annotations: [],
  evidence: [],
};

const EMPTY_VISUAL_MODEL: KnowledgeFileVisualModel = {
  pages: [],
};

const ENTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "label",
    "type",
    "confidence",
    "evidence",
    "sourceElementIds",
    "inferred",
  ],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    type: { type: "string" },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    evidence: { type: "string" },
    sourceElementIds: {
      type: "array",
      items: { type: "string" },
    },
    inferred: { type: "boolean" },
  },
} as const;

const EDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "from",
    "to",
    "label",
    "confidence",
    "evidence",
    "sourceElementIds",
    "inferred",
  ],
  properties: {
    id: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    label: { type: "string" },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    evidence: { type: "string" },
    sourceElementIds: {
      type: "array",
      items: { type: "string" },
    },
    inferred: { type: "boolean" },
  },
} as const;

const EVIDENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "text",
    "pageNumber",
    "sourceElementIds",
  ],
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    pageNumber: {
      type: ["integer", "null"],
    },
    sourceElementIds: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const SEMANTIC_MODEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "semanticModel",
  ],
  properties: {
    semanticModel: {
      type: "object",
      additionalProperties: false,
      required: [
        "nodes",
        "edges",
        "lanes",
        "owners",
        "systems",
        "processes",
        "steps",
        "decisions",
        "inputs",
        "outputs",
        "conditions",
        "exceptions",
        "annotations",
        "evidence",
      ],
      properties: {
        nodes: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        edges: {
          type: "array",
          items: EDGE_SCHEMA,
        },
        lanes: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        owners: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        systems: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        processes: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        steps: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        decisions: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        inputs: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        outputs: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        conditions: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        exceptions: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        annotations: {
          type: "array",
          items: ENTITY_SCHEMA,
        },
        evidence: {
          type: "array",
          items: EVIDENCE_SCHEMA,
        },
      },
    },
  },
} as const;

function resolveStoragePath(storagePath: string) {
  const normalizedPath = storagePath
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");

  const publicRoot = path.resolve(
    process.cwd(),
    "public",
  );

  const absolutePath = path.resolve(
    publicRoot,
    normalizedPath,
  );

  if (
    absolutePath !== publicRoot &&
    !absolutePath.startsWith(
      `${publicRoot}${path.sep}`,
    )
  ) {
    throw new Error(
      "La ruta del archivo no es valida",
    );
  }

  return absolutePath;
}

function getExtension(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractPlainText(buffer: Buffer) {
  return buffer.toString("utf8");
}

async function extractOfficeText(
  absolutePath: string,
) {
  const ast = await parseOffice(absolutePath);
  return ast.toText();
}

function buildVisualContext(
  visualModel: KnowledgeFileVisualModel,
) {
  return visualModel.pages.map((page) => ({
    pageNumber: page.pageNumber,
    elements: page.elements
      .filter((element) => element.text)
      .map((element) => ({
        id: element.id,
        type: element.type,
        text: element.text,
        shapeType: element.shapeType,
      })),
    connections: page.connections.map(
      (connection) => ({
        id: connection.id,
        startElementId:
          connection.startElementId,
        endElementId: connection.endElementId,
        text: connection.text,
      }),
    ),
    notes: page.notes,
  }));
}

function buildSemanticPrompt(params: {
  file: KnowledgeFileForAnalysis;
  visualModel: KnowledgeFileVisualModel;
  text: string;
}) {
  const visualContext = buildVisualContext(
    params.visualModel,
  );

  return [
    "Analiza semanticamente este documento y devuelve exclusivamente el JSON solicitado.",
    "",
    "Reglas:",
    "- No modifiques ni recalcules geometria, posiciones ni estilos.",
    "- Solo identifica elementos cuando exista evidencia textual o visual.",
    "- Cada inferencia debe incluir confidence entre 0 y 1, evidence, sourceElementIds e inferred.",
    "- Usa inferred=false si el elemento aparece explicitamente en el documento.",
    "- Usa inferred=true si es una relacion o clasificacion deducida de evidencia clara.",
    "- Si no hay evidencia suficiente para una categoria, devuelve un array vacio.",
    "",
    `Documento: ${params.file.file_name}`,
    `Tipo: ${params.file.file_type ?? "desconocido"}`,
    "",
    "Contexto visual objetivo disponible:",
    JSON.stringify(visualContext).slice(0, 80_000),
    "",
    "Texto extraido:",
    params.text.slice(0, 120_000),
  ].join("\n");
}

function parseSemanticResponse(
  responseText: string,
): SemanticResponse {
  if (!responseText.trim()) {
    throw new Error(
      "La IA no ha devuelto contenido para el analisis semantico",
    );
  }

  return JSON.parse(responseText) as SemanticResponse;
}

function getUsageTokens(response: ResponseUsageShape) {
  return {
    input:
      response.usage?.input_tokens ??
      response.usage?.input_tokens_details?.cached_tokens ??
      null,
    output:
      response.usage?.output_tokens ?? null,
  };
}

async function generateSemanticModel(params: {
  file: KnowledgeFileForAnalysis;
  visualModel: KnowledgeFileVisualModel;
  text: string;
}) {
  if (!params.text.trim()) {
    return {
      semanticModel: EMPTY_SEMANTIC_MODEL,
      tokensInput: null,
      tokensOutput: null,
      limitation:
        "No hay texto extraido suficiente para generar el modelo semantico.",
    };
  }

  const openai = getOpenAIClient();
  const model = getKnowledgeImportModel();

  const response = await openai.responses.create({
    model,
    instructions:
      "Eres un analista documental experto en procesos, diagramas y documentacion empresarial. Tu salida debe ser JSON valido y fiel a la evidencia.",
    input: buildSemanticPrompt(params),
    text: {
      format: {
        type: "json_schema",
        name: "knowledge_file_semantic_analysis",
        strict: true,
        schema: SEMANTIC_MODEL_SCHEMA,
      },
    },
  });

  const parsed = parseSemanticResponse(
    response.output_text,
  );
  const usage = getUsageTokens(response);

  return {
    semanticModel: parsed.semanticModel,
    tokensInput: usage.input,
    tokensOutput: usage.output,
    limitation: null,
  };
}

export async function analyzeKnowledgeFile(
  file: KnowledgeFileForAnalysis,
): Promise<KnowledgeFileAnalysisResult> {
  if (!file.storage_path) {
    throw new Error(
      "El archivo no tiene ruta de almacenamiento",
    );
  }

  if (!isSupportedKnowledgeDocument(file.file_name)) {
    throw new Error(
      `Formato no compatible: ${
        getExtension(file.file_name) || "sin extension"
      }`,
    );
  }

  const startedAt = Date.now();
  const absolutePath = resolveStoragePath(
    file.storage_path,
  );
  const buffer = await readFile(absolutePath);
  const fileHash = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
  const model = getKnowledgeImportModel();
  const metadata: KnowledgeFileAnalysisMetadata = {
    warnings: [],
    limitations: [],
  };
  let extractor = "text-degraded-v1";
  let visualModel = EMPTY_VISUAL_MODEL;
  let semanticText = cleanExtractedText(
    file.extracted_text,
  );

  if (getExtension(file.file_name) === ".pptx") {
    extractor = "pptx-ooxml-v1";
    visualModel = await extractPptxVisualModel(buffer);

    const visualText = cleanExtractedText(
      extractTextFromVisualModel(visualModel),
    );

    semanticText =
      visualText || semanticText;
  } else if (isPlainTextKnowledgeDocument(file.file_name)) {
    semanticText = cleanExtractedText(
      await extractPlainText(buffer),
    );
    metadata.limitations.push(
      "Formato textual: visualModel no contiene geometria objetiva.",
    );
  } else {
    semanticText =
      semanticText ||
      cleanExtractedText(
        await extractOfficeText(absolutePath),
      );
    metadata.limitations.push(
      "Extractor degradado: solo se usa texto y metadatos disponibles; no se extrae geometria objetiva.",
    );
  }

  if (visualModel.pages.length === 0) {
    metadata.limitations.push(
      "No se ha extraido modelo visual objetivo para este archivo.",
    );
  }

  const semantic = await generateSemanticModel({
    file,
    visualModel,
    text: semanticText,
  });

  if (semantic.limitation) {
    metadata.limitations.push(
      semantic.limitation,
    );
  }

  const analysis: KnowledgeFileCanonicalAnalysis = {
    schemaVersion:
      KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
    source: {
      knowledgeFileId: file.id,
      fileName: file.file_name,
      fileType: file.file_type,
      fileSize: file.file_size,
      fileHash,
      analyzedAt: new Date().toISOString(),
      extractor,
      model,
      promptVersion:
        KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION,
    },
    visualModel,
    semanticModel: semantic.semanticModel,
    metadata,
  };

  return {
    analysis,
    tokensInput: semantic.tokensInput,
    tokensOutput: semantic.tokensOutput,
    processingMs: Date.now() - startedAt,
  };
}

export function toPrismaJson(
  analysis: KnowledgeFileAnalysisResult["analysis"],
) {
  return analysis as unknown as Prisma.InputJsonValue;
}
