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

  if (localText.length >= MIN_EXTRACTED_TEXT_LENGTH) {
    return {
      text: localText,
      extractionMethod: "text",
      confidence: null,
    };
  }

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

async function extractPdfText(buffer: Buffer) {
  const result = await extractText(new Uint8Array(buffer));

  return result.text
    .map((page, index) => {
      const normalizedPage = page.trim();

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

async function extractPdfWithVision(
  buffer: Buffer,
  fileName: string,
) {
  const client = getOpenAI();

  const base64Pdf = buffer.toString("base64");

  const response = await client.responses.create({
    model: AI_MODELS.KNOWLEDGE_ANALYSIS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: fileName,
            file_data: `data:application/pdf;base64,${base64Pdf}`,
            detail: "high",
          },
          {
            type: "input_text",
            text: [
              "Extrae fielmente todo el texto visible de este documento.",
              "Respeta el orden de las páginas.",
              "Incluye títulos, cláusulas, tablas, importes, fechas y notas.",
              "No resumas y no interpretes el contenido.",
              "Marca cada página con el formato: --- Página N ---.",
              "Si una zona no puede leerse, escribe [texto ilegible].",
            ].join(" "),
          },
        ],
      },
    ],
  });

  const extractedText = response.output_text.trim();

  if (!extractedText) {
    throw new Error(
      "No se ha podido extraer texto del PDF escaneado",
    );
  }

  return extractedText;
}

async function ingestImage(
  buffer: Buffer,
  mimeType: string,
): Promise<DocumentIngestionResult> {
  const client = getOpenAI();

  const base64Image = buffer.toString("base64");

  const response = await client.responses.create({
    model: AI_MODELS.KNOWLEDGE_ANALYSIS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${base64Image}`,
            detail: "high",
          },
          {
            type: "input_text",
            text: [
              "Extrae fielmente todo el texto visible de esta imagen.",
              "Respeta la estructura, títulos, tablas, importes y fechas.",
              "No resumas y no interpretes el contenido.",
              "Si una zona no puede leerse, escribe [texto ilegible].",
            ].join(" "),
          },
        ],
      },
    ],
  });

  const extractedText = response.output_text.trim();

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