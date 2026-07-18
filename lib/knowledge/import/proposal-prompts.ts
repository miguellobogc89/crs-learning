// lib/knowledge/import/proposal-prompts.ts
import type {
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportDocumentInput,
} from "./types";

export const DOCUMENT_ANALYSIS_SYSTEM_PROMPT = `
Eres un experto en documentación empresarial y gestión del conocimiento.

Analiza cada documento de forma individual.

Debes identificar:

- qué contiene el documento;
- qué tipo de documento es;
- cuál parece ser su finalidad;
- los temas principales;
- entidades, áreas, equipos, procesos o sistemas mencionados;
- señales de versión, revisión o antigüedad;
- un posible título de artículo;
- una posible ruta de carpetas;
- relaciones evidentes con otros documentos del mismo lote.

No inventes datos que no aparezcan en el contenido.

Los identificadores de documentos deben conservarse exactamente.
`.trim();

export const PROPOSAL_SYSTEM_PROMPT = `
Eres un arquitecto de conocimiento empresarial.

Recibirás análisis estructurados de documentos.

Tu objetivo es proponer una estructura clara y útil de carpetas y artículos.

Reglas:

- Una carpeta representa una agrupación temática estable.
- Un artículo representa una unidad coherente de conocimiento.
- Varios documentos pueden alimentar un mismo artículo.
- Un documento puede aparecer en un único artículo principal.
- Evita crear una carpeta por cada documento.
- Evita crear artículos duplicados.
- Agrupa versiones del mismo proceso dentro del mismo artículo.
- Identifica documentos que podrían ser versiones antiguas.
- Señala posibles duplicados, versiones, contradicciones y documentos huérfanos.
- No afirmes que existe una contradicción si solo hay diferencias de redacción.
- Conserva exactamente los identificadores de documento recibidos.
- No crees identificadores aleatorios largos: usa identificadores legibles como folder-1, article-1 o warning-1.
`.trim();

export function buildDocumentAnalysisPrompt(
  documents: KnowledgeImportDocumentInput[],
) {
  return [
    "Analiza los siguientes documentos:",
    "",
    JSON.stringify(
      documents.map((document) => ({
        documentId: document.id,
        documentName: document.name,
        relativePath:
          document.relativePath,
        content: document.text,
      })),
      null,
      2,
    ),
  ].join("\n");
}

export function buildProposalPrompt(
  analyses: KnowledgeImportDocumentAnalysis[],
) {
  return [
    "Construye la propuesta completa de organización para estos documentos:",
    "",
    JSON.stringify(analyses, null, 2),
  ].join("\n");
}

export const DOCUMENT_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documents"],
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "documentId",
          "documentName",
          "title",
          "summary",
          "documentType",
          "topics",
          "entities",
          "keywords",
          "versionLabel",
          "likelyCurrentVersion",
          "suggestedArticleTitle",
          "suggestedFolderPath",
          "relatedDocumentIds",
        ],
        properties: {
          documentId: {
            type: "string",
          },
          documentName: {
            type: "string",
          },
          title: {
            type: "string",
          },
          summary: {
            type: "string",
          },
          documentType: {
            type: "string",
            enum: [
              "procedure",
              "process",
              "manual",
              "template",
              "spreadsheet",
              "presentation",
              "policy",
              "reference",
              "report",
              "other",
            ],
          },
          topics: {
            type: "array",
            items: {
              type: "string",
            },
          },
          entities: {
            type: "array",
            items: {
              type: "string",
            },
          },
          keywords: {
            type: "array",
            items: {
              type: "string",
            },
          },
          versionLabel: {
            type: ["string", "null"],
          },
          likelyCurrentVersion: {
            type: "boolean",
          },
          suggestedArticleTitle: {
            type: "string",
          },
          suggestedFolderPath: {
            type: "array",
            items: {
              type: "string",
            },
          },
          relatedDocumentIds: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
    },
  },
} as const;

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "title",
    "description",
    "documentIds",
    "documentNames",
    "confidence",
  ],
  properties: {
    id: {
      type: "string",
    },
    title: {
      type: "string",
    },
    description: {
      type: "string",
    },
    documentIds: {
      type: "array",
      items: {
        type: "string",
      },
    },
    documentNames: {
      type: "array",
      items: {
        type: "string",
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
} as const;

const FOLDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "description",
    "folders",
    "articles",
  ],
  properties: {
    id: {
      type: "string",
    },
    name: {
      type: "string",
    },
    description: {
      type: "string",
    },
    folders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "description",
          "folders",
          "articles",
        ],
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          description: {
            type: "string",
          },
          folders: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "name",
                "description",
                "articles",
              ],
              properties: {
                id: {
                  type: "string",
                },
                name: {
                  type: "string",
                },
                description: {
                  type: "string",
                },
                articles: {
                  type: "array",
                  items: ARTICLE_SCHEMA,
                },
              },
            },
          },
          articles: {
            type: "array",
            items: ARTICLE_SCHEMA,
          },
        },
      },
    },
    articles: {
      type: "array",
      items: ARTICLE_SCHEMA,
    },
  },
} as const;

export const PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "summary",
    "folders",
    "rootArticles",
    "warnings",
  ],
  properties: {
    title: {
      type: "string",
    },
    description: {
      type: "string",
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "totalDocuments",
        "totalFolders",
        "totalArticles",
        "totalWarnings",
      ],
      properties: {
        totalDocuments: {
          type: "integer",
        },
        totalFolders: {
          type: "integer",
        },
        totalArticles: {
          type: "integer",
        },
        totalWarnings: {
          type: "integer",
        },
      },
    },
    folders: {
      type: "array",
      items: FOLDER_SCHEMA,
    },
    rootArticles: {
      type: "array",
      items: ARTICLE_SCHEMA,
    },
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "severity",
          "title",
          "description",
          "documentIds",
          "suggestedAction",
        ],
        properties: {
          id: {
            type: "string",
          },
          type: {
            type: "string",
            enum: [
              "duplicate",
              "possible_duplicate",
              "version",
              "contradiction",
              "orphan",
            ],
          },
          severity: {
            type: "string",
            enum: [
              "low",
              "medium",
              "high",
            ],
          },
          title: {
            type: "string",
          },
          description: {
            type: "string",
          },
          documentIds: {
            type: "array",
            items: {
              type: "string",
            },
          },
          suggestedAction: {
            type: "string",
          },
        },
      },
    },
  },
} as const;