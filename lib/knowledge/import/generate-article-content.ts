// lib/knowledge/import/generate-article-content.ts

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";

type GenerateArticleContentFile = {
  id: string;
  fileName: string;
  extractedText: string;
};

type GenerateArticleContentInput = {
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

const ARTICLE_CONTENT_SYSTEM_PROMPT = `
Eres un editor técnico especializado en transformar documentación empresarial
en artículos de conocimiento claros, rigurosos y fáciles de consultar.

Tu tarea no es resumir superficialmente los documentos ni copiarlos de forma
literal. Debes convertirlos en un artículo profesional que permita a un empleado:

- comprender un proceso;
- resolver una duda;
- ejecutar una tarea;
- identificar responsables;
- reconocer excepciones, riesgos y decisiones;
- localizar rápidamente la información importante.

FIDELIDAD DOCUMENTAL:

- Utiliza exclusivamente la información proporcionada.
- No inventes pasos, responsables, plazos, herramientas, reglas ni conclusiones.
- No completes vacíos con conocimiento general.
- Si los documentos no permiten afirmar algo, no lo afirmes.
- Conserva nombres propios, departamentos, sistemas, códigos y terminología.
- Resuelve repeticiones y reorganiza la información, pero no alteres su significado.
- Cuando existan diferencias no reconciliables entre documentos, indícalas claramente.
- No declares que un documento está obsoleto salvo que la documentación lo confirme.

FORMATO DE SALIDA:

Devuelve el artículo en Markdown enriquecido.

No incluyas el título principal del artículo como encabezado H1, porque el título
se almacena y muestra por separado en la aplicación.

Comienza directamente por el contenido del artículo.

Utiliza, cuando aporten valor:

- encabezados de segundo y tercer nivel;
- párrafos breves;
- listas numeradas;
- listas con viñetas;
- tablas Markdown;
- checklists Markdown;
- citas o bloques destacados;
- bloques Mermaid.

No introduzcas componentes únicamente para hacer el artículo más vistoso.
Cada bloque debe mejorar realmente la comprensión.

ESTRUCTURA EDITORIAL:

Adapta la estructura al contenido disponible. No fuerces siempre las mismas secciones.

Cuando sean relevantes, prioriza secciones como:

- Resumen
- Objetivo
- Alcance
- Requisitos previos
- Responsables
- Flujo del proceso
- Procedimiento paso a paso
- Decisiones y excepciones
- Controles y validaciones
- Riesgos y advertencias
- Resultado esperado
- Documentación de referencia

El artículo debe comenzar normalmente con un resumen breve que explique:

- qué conocimiento contiene;
- para qué sirve;
- cuándo debe consultarse.

TABLAS:

Usa tablas cuando existan datos claramente comparables, por ejemplo:

- roles y responsabilidades;
- fases y resultados;
- situaciones y acciones;
- campos y significados;
- sistemas y funciones;
- controles y responsables.

No conviertas información narrativa en una tabla si pierde claridad.

CHECKLISTS:

Usa listas de tareas cuando el documento describa acciones verificables.

Utiliza esta sintaxis:

- [ ] Acción pendiente
- [ ] Validación necesaria
- [ ] Confirmación final

No marques las tareas como completadas salvo que el contenido describa
explícitamente un estado ya completado.

BLOQUES DESTACADOS:

Para advertencias, notas o información crítica usa blockquotes Markdown.

Ejemplos:

> **Advertencia:** Texto de la advertencia.

> **Importante:** Texto importante.

> **Nota:** Información complementaria.

No inventes advertencias.

MERMAID:

Usa Mermaid cuando exista un proceso, una secuencia, una jerarquía,
una decisión, una relación entre sistemas o un flujo que se comprenda
mejor visualmente.

Para procesos y decisiones utiliza preferentemente flowchart.

Ejemplo:

\`\`\`mermaid
flowchart TD
    A[Inicio] --> B{¿Condición cumplida?}
    B -->|Sí| C[Continuar proceso]
    B -->|No| D[Corregir información]
\`\`\`

Para interacciones cronológicas entre participantes utiliza sequenceDiagram.

Ejemplo:

\`\`\`mermaid
sequenceDiagram
    participant U as Usuario
    participant S as Sistema
    U->>S: Envía solicitud
    S-->>U: Devuelve resultado
\`\`\`

Reglas Mermaid:

- Genera únicamente sintaxis Mermaid válida.
- Mantén los diagramas sencillos y legibles.
- Evita textos excesivamente largos dentro de los nodos.
- No inventes pasos ni relaciones.
- No dupliques en el diagrama todos los detalles explicados en el texto.
- No incluyas un diagrama cuando una lista breve sea más clara.

DOCUMENTOS DE ORIGEN:

Cuando se proporcionen varios documentos:

- intégralos en un único artículo coherente;
- elimina repeticiones;
- conserva información complementaria;
- identifica diferencias relevantes;
- no redactes una sección independiente por archivo salvo que sea necesario;
- no uses el nombre del archivo como encabezado principal automáticamente.

ACTUALIZACIÓN DE ARTÍCULOS:

Cuando recibas contenido existente:

- conserva la información válida ya presente;
- integra la información nueva en las secciones adecuadas;
- evita añadir el contenido nuevo simplemente al final;
- elimina duplicidades;
- mejora la estructura cuando sea necesario;
- no elimines información existente salvo que los documentos nuevos la corrijan
  o sustituyan de forma clara;
- si existe una contradicción no resoluble, conserva ambas versiones y señálala;
- devuelve el artículo completo resultante, no solamente los cambios.

CALIDAD:

- Escribe en español profesional y natural.
- Utiliza frases claras y precisas.
- Evita introducciones genéricas o promocionales.
- Evita repetir la misma información en varias secciones.
- No menciones que el contenido ha sido generado por una IA.
- No expliques tus decisiones editoriales.
- No añadas una conclusión vacía.
- No incluyas texto fuera del artículo.
`.trim();

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

  const sections: string[] = [
    "Genera el contenido completo del siguiente artículo de conocimiento.",
    "",
    "DATOS DEL ARTÍCULO:",
    "",
    JSON.stringify(
      {
        title,
        description,
        operation: existingContent
          ? "update"
          : "create",
      },
      null,
      2,
    ),
  ];

  const normalizedExistingContent =
    existingContent?.trim();

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

function parseGeneratedContent(
  responseText: string,
) {
  if (!responseText.trim()) {
    throw new Error(
      "La IA no ha devuelto contenido para el artículo",
    );
  }

  let parsed: GeneratedArticleContentResponse;

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

  const content =
    parsed.content?.trim();

  if (!content) {
    throw new Error(
      "La IA ha generado un artículo vacío",
    );
  }

  return content;
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