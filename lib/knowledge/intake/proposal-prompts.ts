// lib/knowledge/intake/proposal-prompts.ts

import type {
  KnowledgeIntakeCandidateArticle,
  KnowledgeIntakeDocumentInput,
  KnowledgeIntakeExistingFolder,
} from "./types";

export const KNOWLEDGE_INTAKE_SYSTEM_PROMPT = `
Eres el responsable de incorporar nuevo conocimiento a una biblioteca empresarial.

Tu trabajo consiste en analizar cada documento nuevo y decidir qué debe ocurrir ANTES de crear o modificar nada.

Debes escoger exactamente una decisión por documento:

1. exact_duplicate
El documento ya existe o contiene esencialmente el mismo contenido que un documento previamente almacenado.
No debe añadirse ni debe modificarse ningún artículo.

2. possible_duplicate
El documento parece muy similar a uno existente, pero no existe seguridad suficiente para bloquearlo automáticamente.
Debe solicitarse revisión humana.

3. new_version
El documento parece ser una versión posterior, revisada o actualizada de un documento ya existente.
Debe asociarse al artículo existente, pero debe advertirse de que podría sustituir o dejar obsoleta una versión anterior.

4. enrich_existing_article
El documento no es duplicado, pero responde a la misma necesidad, proceso, procedimiento, producto o pregunta que un artículo existente.
Debe enriquecer ese artículo.

5. create_article_in_existing_folder
El documento representa una unidad de conocimiento nueva y debe crear un artículo dentro de una carpeta que ya existe.

6. create_article_in_new_folder
El documento representa una unidad de conocimiento nueva y no existe ninguna carpeta razonablemente adecuada.
Debe proponer una sola carpeta nueva y un artículo dentro de ella.

REGLAS PRINCIPALES

- Sé conservador al declarar duplicados exactos.
- No declares exact_duplicate solo porque el título o el nombre del fichero se parezcan.
- Compara el contenido, propósito, alcance, pasos, entidades, fechas y versión.
- Una similitud semántica alta no siempre implica duplicado.
- Dos documentos complementarios deben enriquecer el mismo artículo, no considerarse duplicados.
- Una presentación y un procedimiento pueden pertenecer al mismo artículo si sirven para resolver la misma necesidad del empleado.
- Una versión nueva debe clasificarse como new_version aunque gran parte del contenido coincida.
- No crees una carpeta nueva cuando ya exista una ubicación razonable.
- No crees un artículo nuevo cuando un artículo existente responda a la misma pregunta o necesidad.
- La pregunta principal es:
  "¿Consultaría un empleado este documento para resolver la misma necesidad que alguno de los artículos existentes?"

SIMILITUD

- Usa un valor entre 0 y 1.
- exact_duplicate suele requerir 0.96 o más.
- possible_duplicate suele estar entre 0.80 y 0.95.
- new_version puede tener una similitud alta, pero debe haber señales de actualización, revisión, fecha, versión o cambios.
- enrich_existing_article puede tener una similitud menor si el contenido es complementario.

DESTINO

Para exact_duplicate y possible_duplicate:
- destination.articleId debe apuntar al artículo relacionado cuando exista.
- destination.articleTitle debe contener su título.
- destination.folderId debe contener la carpeta del artículo.
- destination.folderPath debe contener su ruta.
- destination.newFolderName debe ser null.

Para new_version y enrich_existing_article:
- destination.articleId es obligatorio.
- No inventes IDs.
- Usa únicamente los artículos candidatos proporcionados.

Para create_article_in_existing_folder:
- destination.articleId debe ser null.
- destination.articleTitle debe ser un título profesional y específico para el nuevo artículo.
- destination.folderId debe usar una carpeta existente.
- destination.folderPath debe coincidir con esa carpeta.
- destination.newFolderName debe ser null.

Para create_article_in_new_folder:
- destination.articleId debe ser null.
- destination.folderId debe ser null.
- destination.folderPath debe incluir la ruta propuesta completa.
- destination.newFolderName debe contener únicamente el nombre de la carpeta nueva.
- Crea como máximo una carpeta nueva por documento.

DUPLICATE MATCH

- duplicateMatch debe ser null salvo en:
  exact_duplicate
  possible_duplicate
  new_version
- articleId debe usar un ID real proporcionado.
- fileId puede ser null cuando la coincidencia sea con el artículo en general.
- similarity debe estar entre 0 y 1.

CALIDAD

- Los títulos deben ser claros, profesionales y orientados a consulta.
- Los resúmenes deben explicar qué conocimiento aporta el documento.
- Los motivos deben ser concretos.
- No utilices frases vagas como "parece relacionado".
- Explica qué contenido, finalidad o versión justifica la decisión.
- La confianza debe estar entre 0 y 1.
- No inventes documentos, carpetas, artículos ni identificadores.
`.trim();

export const KNOWLEDGE_INTAKE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "decisions",
    "warnings",
  ],
  properties: {
    title: {
      type: "string",
    },
    description: {
      type: "string",
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "documentId",
          "documentName",
          "decision",
          "confidence",
          "title",
          "summary",
          "reason",
          "duplicateMatch",
          "destination",
          "detectedTopics",
          "detectedEntities",
          "detectedKeywords",
          "warnings",
        ],
        properties: {
          documentId: {
            type: "string",
          },
          documentName: {
            type: "string",
          },
          decision: {
            type: "string",
            enum: [
              "exact_duplicate",
              "possible_duplicate",
              "new_version",
              "enrich_existing_article",
              "create_article_in_existing_folder",
              "create_article_in_new_folder",
            ],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          title: {
            type: "string",
          },
          summary: {
            type: "string",
          },
          reason: {
            type: "string",
          },
          duplicateMatch: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: [
                  "articleId",
                  "articleTitle",
                  "fileId",
                  "fileName",
                  "similarity",
                  "reason",
                ],
                properties: {
                  articleId: {
                    type: "string",
                  },
                  articleTitle: {
                    type: "string",
                  },
                  fileId: {
                    type: ["string", "null"],
                  },
                  fileName: {
                    type: ["string", "null"],
                  },
                  similarity: {
                    type: "number",
                    minimum: 0,
                    maximum: 1,
                  },
                  reason: {
                    type: "string",
                  },
                },
              },
              {
                type: "null",
              },
            ],
          },
          destination: {
            type: "object",
            additionalProperties: false,
            required: [
              "articleId",
              "articleTitle",
              "folderId",
              "folderPath",
              "newFolderName",
            ],
            properties: {
              articleId: {
                type: ["string", "null"],
              },
              articleTitle: {
                type: "string",
              },
              folderId: {
                type: ["string", "null"],
              },
              folderPath: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              newFolderName: {
                type: ["string", "null"],
              },
            },
          },
          detectedTopics: {
            type: "array",
            items: {
              type: "string",
            },
          },
          detectedEntities: {
            type: "array",
            items: {
              type: "string",
            },
          },
          detectedKeywords: {
            type: "array",
            items: {
              type: "string",
            },
          },
          warnings: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
} as const;

type BuildKnowledgeIntakePromptInput = {
  documents: KnowledgeIntakeDocumentInput[];
  candidateArticlesByDocumentId: Map<
    string,
    KnowledgeIntakeCandidateArticle[]
  >;
  folders: KnowledgeIntakeExistingFolder[];
};

function serializeDocument(
  document: KnowledgeIntakeDocumentInput,
) {
  return [
    `DOCUMENT_ID: ${document.id}`,
    `DOCUMENT_NAME: ${document.name}`,
    `MIME_TYPE: ${document.mimeType ?? "unknown"}`,
    `SIZE_BYTES: ${document.size ?? "unknown"}`,
    "",
    "DOCUMENT_TEXT:",
    document.text,
  ].join("\n");
}

function serializeCandidateArticle(
  article: KnowledgeIntakeCandidateArticle,
) {
  const folderPath =
    article.libraryPath.length > 0
      ? article.libraryPath.join(" / ")
      : "Raíz";

  return [
    `ARTICLE_ID: ${article.id}`,
    `ARTICLE_TITLE: ${article.title}`,
    `ARTICLE_DESCRIPTION: ${article.description ?? ""}`,
    `ARTICLE_SUMMARY: ${article.summary ?? ""}`,
    `FOLDER_ID: ${article.libraryId}`,
    `FOLDER_PATH: ${folderPath}`,
    `FILE_NAMES: ${article.fileNames.join(", ")}`,
    `LEXICAL_SCORE: ${article.lexicalScore.toFixed(4)}`,
    "",
    "ARTICLE_COMPARISON_TEXT:",
    article.comparisonText,
  ].join("\n");
}

function serializeFolder(
  folder: KnowledgeIntakeExistingFolder,
) {
  return [
    `FOLDER_ID: ${folder.id}`,
    `FOLDER_NAME: ${folder.name}`,
    `FOLDER_PATH: ${
      folder.path.length > 0
        ? folder.path.join(" / ")
        : folder.name
    }`,
  ].join("\n");
}

export function buildKnowledgeIntakePrompt({
  documents,
  candidateArticlesByDocumentId,
  folders,
}: BuildKnowledgeIntakePromptInput) {
  const documentBlocks = documents.map(
    (document, index) => {
      const candidates =
        candidateArticlesByDocumentId.get(
          document.id,
        ) ?? [];

      const candidateBlocks =
        candidates.length > 0
          ? candidates.map(
              (candidate, candidateIndex) =>
                [
                  `--- CANDIDATE ARTICLE ${candidateIndex + 1} ---`,
                  serializeCandidateArticle(candidate),
                ].join("\n"),
            )
          : [
              "No se han encontrado artículos candidatos con coincidencia léxica relevante.",
            ];

      return [
        `================ DOCUMENT ${index + 1} ================`,
        serializeDocument(document),
        "",
        "CANDIDATE EXISTING ARTICLES:",
        ...candidateBlocks,
        `================ END DOCUMENT ${index + 1} ================`,
      ].join("\n\n");
    },
  );

  const folderBlocks =
    folders.length > 0
      ? folders.map(
          (folder, index) =>
            [
              `--- EXISTING FOLDER ${index + 1} ---`,
              serializeFolder(folder),
            ].join("\n"),
        )
      : ["No existen carpetas disponibles."];

  return [
    "Analiza todos los documentos nuevos.",
    "",
    "Devuelve exactamente una decisión para cada DOCUMENT_ID.",
    "No omitas documentos y no añadas documentos desconocidos.",
    "",
    "================ EXISTING FOLDERS ================",
    ...folderBlocks,
    "================ END EXISTING FOLDERS ================",
    "",
    ...documentBlocks,
  ].join("\n\n");
}