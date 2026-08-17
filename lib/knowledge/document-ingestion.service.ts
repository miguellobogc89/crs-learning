// lib/knowledge/document-ingestion.service.ts

import { extractText } from "unpdf";

import { getOpenAI } from "@/lib/ai/openai";
import { AI_MODELS } from "@/lib/ai/models";

export type ExtractionMethod =
  | "text"
  | "vision"
  | "unsupported";

export type DocumentIngestionResult = {
  text: string;
  extractionMethod: ExtractionMethod;
  confidence: number | null;
};

type IngestDocumentInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

const MIN_EXTRACTED_TEXT_LENGTH = 500;

export async function ingestDocument({
  buffer,
  fileName,
  mimeType,
}: IngestDocumentInput): Promise<DocumentIngestionResult> {
  if (mimeType === "application/pdf") {
    return ingestPdf(buffer, fileName);
  }

  if (mimeType.startsWith("image/")) {
    return ingestImage(buffer, mimeType);
  }

  throw new Error(
    `La ingestión avanzada no soporta el formato ${mimeType}`,
  );
}

async function ingestPdf(
  buffer: Buffer,
  fileName: string,
): Promise<DocumentIngestionResult> {
  const localText = await extractPdfText(buffer);

  const hasEnoughText =
    localText.length >= MIN_EXTRACTED_TEXT_LENGTH;

  const hasMathematicalContent =
    looksLikeMathematicalContent(localText);

  /*
   * Caso normal:
   * el PDF tiene texto suficiente y no presenta
   * señales relevantes de notación matemática.
   *
   * Conservamos la extracción rápida mediante unpdf.
   */
  if (
    hasEnoughText &&
    !hasMathematicalContent
  ) {
    return {
      text: localText,
      extractionMethod: "text",
      confidence: null,
    };
  }

  /*
   * Casos que mandamos al modelo:
   *
   * 1. PDF escaneado / extracción pobre.
   * 2. PDF con contenido matemático.
   *
   * En ambos casos queremos preservar estructura visual.
   */
  const visionText = await extractPdfWithVision(
    buffer,
    fileName,
  );

  return {
    text: visionText,
    extractionMethod: "vision",
    confidence: null,
  };
}

async function extractPdfText(
  buffer: Buffer,
) {
  const result = await extractText(
    new Uint8Array(buffer),
  );

  return result.text
    .map((page, index) => {
      const normalizedPage =
        page.trim();

      if (!normalizedPage) {
        return "";
      }

      return [
        `--- Página ${index + 1} ---`,
        normalizedPage,
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Detecta señales de que el documento contiene
 * notación matemática que no queremos degradar
 * a texto plano.
 *
 * No pretende comprender matemáticas.
 * Su función es decidir cuándo merece la pena
 * usar extracción multimodal.
 */
function looksLikeMathematicalContent(
  text: string,
) {
  if (!text.trim()) {
    return false;
  }

  const mathematicalPatterns = [
    /*
     * Letras griegas frecuentes
     */
    /[α-ωΑ-Ω]/u,

    /*
     * Operadores matemáticos Unicode
     */
    /[∑∏∫∂√∞≈≠≤≥±×÷∇∆]/u,

    /*
     * Superíndices y subíndices Unicode
     */
    /[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/u,

    /*
     * Variables con subíndice representado
     * como texto:
     * x_1
     * β_2
     * a_{ij}
     */
    /[A-Za-zα-ωΑ-Ω]\s*_\s*(?:\{[^}]+\}|[A-Za-z0-9]+)/u,

    /*
     * Potencias:
     * x^2
     * e^-x
     * x^{n+1}
     */
    /[A-Za-z0-9)]\s*\^\s*(?:\{[^}]+\}|[-+A-Za-z0-9]+)/u,

    /*
     * Funciones matemáticas frecuentes
     */
    /\b(?:sin|cos|tan|log|ln|exp|lim)\s*\(/iu,

    /*
     * Fracciones expresadas de forma textual
     */
    /\b[A-Za-z0-9]+\s*\/\s*[A-Za-z0-9]+\b/u,

    /*
     * Ecuaciones con variables
     */
    /(?:[A-Za-zα-ωΑ-Ω]\w*)\s*=\s*[^=\n]{1,80}/u,

    /*
     * Notación matricial sencilla
     */
    /\[[^\]]+\]\s*(?:×|x)\s*\[[^\]]+\]/u,
  ];

  let detectedPatterns = 0;

  for (
    const pattern of mathematicalPatterns
  ) {
    if (pattern.test(text)) {
      detectedPatterns += 1;
    }
  }

  /*
   * Una única coincidencia podría ser accidental.
   *
   * Dos señales diferentes son suficientes para
   * considerar el documento matemático.
   *
   * Los operadores matemáticos fuertes por sí solos
   * también justifican preservar el documento.
   */
  const hasStrongMathematicalSymbol =
    /[∑∏∫∂√∞∇]/u.test(text);

  if (hasStrongMathematicalSymbol) {
    return true;
  }

  return detectedPatterns >= 2;
}

async function extractPdfWithVision(
  buffer: Buffer,
  fileName: string,
) {
  const client = getOpenAI();

  const base64Pdf =
    buffer.toString("base64");

  const response =
    await client.responses.create({
      model:
        AI_MODELS.KNOWLEDGE_ANALYSIS,

      input: [
        {
          role: "user",

          content: [
            {
              type: "input_file",
              filename: fileName,
              file_data:
                `data:application/pdf;base64,${base64Pdf}`,
            },

            {
              type: "input_text",

              text: [
                "Extrae fielmente todo el contenido visible de este documento.",
                "No resumas y no interpretes el contenido.",
                "Respeta el orden y la estructura de las páginas.",
                "Marca cada página con el formato: --- Página N ---.",

                "IMPORTANTE PARA CONTENIDO MATEMÁTICO:",
                "Conserva todas las ecuaciones, fórmulas, variables y símbolos matemáticos.",
                "Convierte las expresiones matemáticas a LaTeX cuando sea necesario para preservar su significado.",
                "Usa $...$ para expresiones matemáticas inline.",
                "Usa $$...$$ para ecuaciones independientes o fórmulas en bloque.",
                "Conserva exactamente letras griegas, subíndices, superíndices, fracciones, raíces, integrales, derivadas, sumatorios, productos, límites, vectores y matrices.",
                "No sustituyas una ecuación por una descripción textual.",
                "No intentes resolver ni modificar las ecuaciones.",
                "Si una fórmula no puede identificarse con seguridad, conserva todo lo visible y marca la zona como [fórmula ilegible].",

                "Conserva también títulos, párrafos, tablas, importes, fechas y notas.",
                "Si cualquier otra zona no puede leerse, escribe [texto ilegible].",
              ].join(" "),
            },
          ],
        },
      ],
    });

  const extractedText =
    response.output_text.trim();

  if (!extractedText) {
    throw new Error(
      "No se ha podido extraer texto del PDF",
    );
  }

  return extractedText;
}

async function ingestImage(
  buffer: Buffer,
  mimeType: string,
): Promise<DocumentIngestionResult> {
  const client = getOpenAI();

  const base64Image =
    buffer.toString("base64");

  const response =
    await client.responses.create({
      model:
        AI_MODELS.KNOWLEDGE_ANALYSIS,

      input: [
        {
          role: "user",

          content: [
            {
              type: "input_image",
              image_url:
                `data:${mimeType};base64,${base64Image}`,
              detail: "high",
            },

            {
              type: "input_text",

              text: [
                "Extrae fielmente todo el contenido visible de esta imagen.",
                "Respeta la estructura, títulos, tablas, importes y fechas.",
                "No resumas y no interpretes el contenido.",

                "Si existen fórmulas o expresiones matemáticas, consérvalas mediante LaTeX.",
                "Usa $...$ para matemáticas inline y $$...$$ para ecuaciones independientes.",
                "Conserva letras griegas, subíndices, superíndices, fracciones, matrices, integrales, sumatorios y demás simbología matemática.",
                "No resuelvas ni modifiques las ecuaciones.",

                "Si una zona no puede leerse, escribe [texto ilegible].",
              ].join(" "),
            },
          ],
        },
      ],
    });

  const extractedText =
    response.output_text.trim();

  if (!extractedText) {
    throw new Error(
      "No se ha podido extraer texto de la imagen",
    );
  }

  return {
    text: extractedText,
    extractionMethod: "vision",
    confidence: null,
  };
}