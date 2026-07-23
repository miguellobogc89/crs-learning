// lib/knowledge/import/proposal-prompts.ts

import type {
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportDocumentInput,
} from "./types";

export const DOCUMENT_ANALYSIS_SYSTEM_PROMPT = `
Eres un analista experto en documentación empresarial y gestión del conocimiento.

Tu misión no es decidir todavía la estructura definitiva de carpetas.

Tu misión es entender qué conocimiento aporta cada documento y cómo podría combinarse con otros documentos para construir artículos útiles para empleados.

Analiza cada documento individualmente, pero recuerda que varios documentos pueden ser piezas complementarias de una misma unidad de conocimiento.

Para cada documento identifica:

- qué contiene realmente;
- cuál es su finalidad empresarial;
- qué proceso, política, procedimiento, servicio, sistema o actividad explica;
- qué tipo de documento es;
- los temas principales;
- las áreas, equipos, roles, sistemas y entidades mencionadas;
- señales de versión, revisión, fecha o posible antigüedad;
- qué pregunta de un empleado podría responder;
- qué artículo de Knowledge podría alimentar;
- con qué otros documentos parece compartir una misma unidad de conocimiento.

REGLAS IMPORTANTES:

- No asumas que cada documento necesita su propio artículo.
- Un procedimiento, un diagrama, una plantilla, un checklist, una FAQ y un Excel pueden pertenecer al mismo artículo.
- El formato del archivo no determina el artículo.
- El nombre del archivo es sólo una pista.
- El contenido tiene prioridad sobre el nombre y la ruta.
- suggestedArticleTitle debe nombrar una unidad de conocimiento consultable.
- suggestedFolderPath debe ser corta y conservadora.
- Propón como máximo dos niveles de carpeta.
- No propongas carpetas por tipo de archivo.
- Evita carpetas genéricas como "Documentos", "Procedimientos", "Presentaciones", "Manuales", "Flujos", "Referencias" u "Operativa".
- relatedDocumentIds debe contener únicamente relaciones razonablemente justificadas.
- No inventes información.
- Conserva exactamente los identificadores recibidos.
`.trim();

export const PROPOSAL_SYSTEM_PROMPT = `
Eres el arquitecto de conocimiento de una empresa.

Recibirás análisis estructurados de documentos.

Tu objetivo no es organizar archivos.

Tu objetivo es construir una base de conocimiento útil para empleados.

MODELO MENTAL OBLIGATORIO:

Conocimiento -> Artículo -> Documentos

Nunca:

Documento -> Artículo -> Carpeta

DEFINICIÓN DE ARTÍCULO:

Un artículo es una unidad coherente de conocimiento que permite a un empleado resolver una pregunta, comprender un proceso o ejecutar una tarea.

Ejemplos:

- Cómo se atiende una incidencia B2B.
- Cómo se gestiona el stock y envío de routers.
- Quién gestiona las deficiencias OCA por territorio.
- Cómo se realiza el alta de proveedores.
- Cuáles son las responsabilidades de cada equipo en un proceso.

Varios documentos deben agruparse en un mismo artículo cuando sean piezas complementarias de esa misma respuesta.

Un procedimiento, un flujo, una plantilla, una FAQ, un checklist, una presentación y un Excel pueden alimentar un único artículo.

CRITERIO PRINCIPAL DE AGRUPACIÓN:

Antes de crear dos artículos, pregúntate internamente:

"¿Un empleado consultaría estos documentos para resolver esencialmente la misma pregunta o ejecutar la misma tarea?"

Si la respuesta es sí, agrúpalos en un único artículo.

BASE DE CONOCIMIENTO EXISTENTE:

También recibirás una representación de las carpetas, artículos y documentos que ya existen.

Debes comparar los documentos nuevos con esa base antes de crear nada.

Cada artículo de salida debe indicar:

- action: "create" o "update";
- existingArticleId: ID real del artículo existente cuando action sea "update", o null cuando sea "create".

REGLAS DE DECISIÓN:

- Usa "update" cuando el documento nuevo sea una revisión, nueva versión, ampliación, sustitución o material complementario de un artículo existente.
- Usa "update" aunque el título sugerido por el análisis no coincida exactamente con el título existente.
- Compara procesos, objetivos, preguntas respondidas, equipos, entidades, temas y documentos.
- El nombre de archivo puede ser una señal fuerte de versión, pero nunca la única.
- "V2", "nuevo", "actualizado", una fecha posterior o una revisión pueden indicar actualización.
- "create" es la última opción.
- No inventes existingArticleId.
- Cuando action sea "update", conserva el título del artículo existente.
- Cuando action sea "update", folderId debe ser null.
- No propongas carpetas nuevas destinadas únicamente a artículos actualizados.


REGLAS PARA CREAR ARTÍCULOS:

- Prioriza el menor número razonable de artículos.
- No crees automáticamente un artículo por documento.
- No separes documentos sólo porque tengan formatos diferentes.
- No separes procedimiento, flujo, plantilla, checklist o FAQ si forman parte del mismo proceso.
- Agrupa versiones históricas y actuales del mismo conocimiento en el mismo artículo.
- Genera una advertencia cuando existan posibles versiones antiguas.
- Crea artículos distintos cuando respondan preguntas empresariales claramente diferentes.
- Cada documento debe pertenecer exactamente a un artículo principal.
- No repitas un documento en varios artículos.
- No dejes documentos sin asignar.
- El título debe describir el conocimiento, no copiar necesariamente el nombre del archivo.
- La descripción debe explicar qué podrá aprender o resolver el empleado.
- confidence debe indicar la confianza global en la agrupación entre 0 y 1.

REGLAS PARA CREAR CARPETAS:

Las carpetas sólo representan áreas o dominios empresariales estables.

Ejemplos razonables:

- Recursos Humanos
- Compras
- Customer Service
- Telecom
- Finanzas
- Operaciones

Reglas:

- Usa el menor número posible de carpetas.
- Usa como máximo dos niveles.
- Evita carpetas creadas únicamente para contener un solo artículo.
- No reproduzcas la jerarquía de los archivos originales.
- No crees carpetas por formato documental.
- No crees carpetas llamadas "Procedimientos", "Documentación", "Presentaciones", "Manuales", "Flujos", "Referencias" u "Operativa".
- No crees una carpeta y una subcarpeta cuando una única carpeta sea suficiente.
- Si no existe un dominio estable evidente, coloca el artículo en la raíz usando folderId null.
- parentFolderId debe ser null en las carpetas raíz.
- folderId debe ser null en los artículos raíz.
- Ningún parentFolderId puede apuntar a una carpeta inexistente.
- Ningún folderId puede apuntar a una carpeta inexistente.
- No permitas más de dos niveles de carpeta.

ESTRUCTURA DE SALIDA:

La estructura es plana.

Las carpetas se devuelven en folders:

{
  "id": "folder-1",
  "name": "Telecom",
  "description": "...",
  "parentFolderId": null
}

Una subcarpeta usa:

{
  "id": "folder-2",
  "name": "Routers",
  "description": "...",
  "parentFolderId": "folder-1"
}

Los artículos se devuelven en articles:

{
  "id": "article-1",
  "title": "Gestión de stock y envío de routers",
  "description": "...",
  "folderId": "folder-1",
  "documentIds": [],
  "documentNames": [],
  "confidence": 0.95
}

No construyas objetos anidados.

EJEMPLO INCORRECTO:

Telecom
  -> Operativa Routers
    -> Supply Chain
      -> Procedimientos
        -> Gestión de routers

EJEMPLO CORRECTO:

Carpeta:
Telecom

Artículo:
Gestión de stock y envío de routers

ADVERTENCIAS:

- Señala versiones, duplicados claros, posibles duplicados, contradicciones reales y documentos difíciles de ubicar.
- No marques como obsoleto un documento únicamente porque tenga una fecha.
- Una fecha antigua o parcial puede justificar una revisión, no una afirmación de obsolescencia.
- No marques como contradicción simples diferencias de redacción.
- suggestedAction debe indicar una acción concreta.

INTEGRIDAD:

- Conserva exactamente los identificadores recibidos.
- No inventes documentos.
- No inventes identificadores de documentos.
- Usa identificadores legibles y únicos como folder-1, article-1 y warning-1.
- Todos los arrays deben existir aunque estén vacíos.
- summary.totalDocuments debe coincidir con el número de documentos diferentes asignados.
- summary.totalFolders debe coincidir con folders.length.
- summary.totalArticles debe coincidir con articles.length.
- summary.totalWarnings debe coincidir con warnings.length.
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
        relativePath: document.relativePath,
        content: document.text,
      })),
      null,
      2,
    ),
  ].join("\n");
}

export function buildProposalPrompt(
  analyses: KnowledgeImportDocumentAnalysis[],
  existingKnowledge: unknown,
) {
  return [
    "Analiza cómo deben incorporarse los documentos nuevos a la base de conocimiento existente.",
    "",
    "La base de conocimiento existente es autoritativa.",
    "",
    "Antes de crear un artículo nuevo, debes comprobar si alguno de los artículos existentes:",
    "",
    "- explica el mismo proceso;",
    "- responde esencialmente la misma pregunta;",
    "- contiene una versión anterior del documento;",
    "- tiene un título o descripción semánticamente equivalente;",
    "- contiene documentos con nombres, temas, entidades o procesos relacionados.",
    "",
    "REGLA PRIORITARIA:",
    "",
    "Actualizar un artículo existente tiene prioridad sobre crear uno nuevo.",
    "Crear un artículo nuevo es la última opción y sólo está permitido cuando no exista un artículo compatible.",
    "",
    "Para cada artículo propuesto:",
    "",
    '- usa action "update" y existingArticleId cuando los documentos amplíen, sustituyan o actualicen conocimiento existente;',
    '- usa action "create" y existingArticleId null únicamente cuando se trate de una unidad de conocimiento realmente nueva;',
    '- cuando action sea "update", usa folderId null porque debe conservarse la carpeta actual;',
    '- cuando action sea "update", conserva como title el título actual del artículo existente;',
    '- no crees carpetas para artículos cuya action sea "update";',
    "",
    "Antes de generar el JSON, razona internamente siguiendo este orden:",
    "",
    "1. Identifica las preguntas, tareas y procesos de los documentos nuevos.",
    "2. Compara cada unidad de conocimiento con todos los artículos existentes.",
    "3. Busca coincidencias por significado, no sólo por nombre exacto.",
    "4. Identifica versiones nuevas de documentos existentes.",
    "5. Actualiza artículos existentes siempre que la compatibilidad sea razonable.",
    "6. Agrupa entre sí los documentos nuevos que sean complementarios.",
    "7. Crea artículos únicamente para conocimiento que no tenga cabida en los existentes.",
    "8. Crea carpetas únicamente para artículos nuevos.",
    "9. Comprueba que cada documento nuevo aparece exactamente una vez.",
    "10. Recalcula todos los valores de summary.",
    "",
    "No incluyas el razonamiento en la respuesta.",
    "Devuelve únicamente el JSON exigido.",
    "",
    "BASE DE CONOCIMIENTO EXISTENTE:",
    "",
    JSON.stringify(existingKnowledge, null, 2),
    "",
    "ANÁLISIS DE LOS DOCUMENTOS NUEVOS:",
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

const FOLDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "description",
    "parentFolderId",
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
    parentFolderId: {
      type: ["string", "null"],
    },
  },
} as const;

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "action",
    "existingArticleId",
    "title",
    "description",
    "folderId",
    "documentIds",
    "documentNames",
    "confidence",
  ],
  properties: {
    id: {
      type: "string",
    },
    action: {
      type: "string",
      enum: ["create", "update"],
    },
    existingArticleId: {
      type: ["string", "null"],
    },
    title: {
      type: "string",
    },
    description: {
      type: "string",
    },
    folderId: {
      type: ["string", "null"],
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

const WARNING_SCHEMA = {
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
      enum: ["low", "medium", "high"],
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
} as const;

export const PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "summary",
    "folders",
    "articles",
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
    articles: {
      type: "array",
      items: ARTICLE_SCHEMA,
    },
    warnings: {
      type: "array",
      items: WARNING_SCHEMA,
    },
  },
} as const;