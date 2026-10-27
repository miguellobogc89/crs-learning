import path from "node:path";
import { isSupportedKnowledgeDocument } from "@/lib/knowledge/import/supported-formats";

/**
 * Formats accepted by the intake pipeline: the Knowledge document formats (PDF, spreadsheets, text…) plus image
 * files (photos of tickets and delivery notes), read with Google Vision and sent to the model as images.
 */
export const INTAKE_IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
};
export const INTAKE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export const isIntakeImage = (fileName: string) => path.extname(fileName).toLowerCase() in INTAKE_IMAGE_TYPES;
export const intakeImageMime = (fileName: string) => INTAKE_IMAGE_TYPES[path.extname(fileName).toLowerCase()] ?? null;

/** Null when accepted; otherwise why not, in plain words. */
export function intakeFormatProblem(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  if (isIntakeImage(fileName) || isSupportedKnowledgeDocument(fileName)) return null;
  if (ext === ".heic" || ext === ".heif") return `${fileName}: las fotos HEIC del iPhone no se pueden leer; compártela como JPG (o haz una captura)`;
  return `${fileName}: formato no admitido`;
}
