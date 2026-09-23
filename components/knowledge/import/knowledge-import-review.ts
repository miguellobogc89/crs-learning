
// components/knowledge/import/knowledge-import-review.ts

export type KnowledgeImportReviewStatus =
  | "unsupported"
  | "duplicate"
  | "possible-duplicate";

export type KnowledgeImportReviewFile = {
  id: string;
  fileName: string;
  relativePath: string;
  fileSize: number;
  status: KnowledgeImportReviewStatus;
  duplicate: string | null;
  existingKnowledgeFileId: string | null;
};

export type KnowledgeImportAcceptedFile = {
  id: string;
  fileName: string;
  relativePath: string;
  fileSize: number;
};

export type KnowledgeImportReviewInventory = {
  totalFiles: number;
  totalBytes: number;
  archiveCount: number;
  skippedArchiveEntries: Array<{
    archiveName: string;
    relativePath: string;
    reason: "directory" | "invalid-path";
  }>;
};

export type KnowledgeImportReviewResult = {
  status: "requires_review";
  error: string;
  inventory: KnowledgeImportReviewInventory;
  acceptedFiles: KnowledgeImportAcceptedFile[];
  reviewFiles: KnowledgeImportReviewFile[];
  unreadableExistingDocumentIds: string[];
};

export class KnowledgeImportReviewRequiredError extends Error {
  readonly review: KnowledgeImportReviewResult;

  constructor(review: KnowledgeImportReviewResult) {
    super(
      review.error ||
        "La selección contiene documentos que requieren revisión.",
    );

    this.name = "KnowledgeImportReviewRequiredError";
    this.review = review;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function isKnowledgeImportReviewResult(
  value: unknown,
): value is KnowledgeImportReviewResult {
  if (!isRecord(value)) {
    return false;
  }

  if (value.status !== "requires_review") {
    return false;
  }

  if (
    typeof value.error !== "string" ||
    !Array.isArray(value.reviewFiles) ||
    !Array.isArray(value.acceptedFiles) ||
    !Array.isArray(
      value.unreadableExistingDocumentIds,
    )
  ) {
    return false;
  }

  if (!isRecord(value.inventory)) {
    return false;
  }

  return (
    typeof value.inventory.totalFiles === "number" &&
    typeof value.inventory.totalBytes === "number" &&
    typeof value.inventory.archiveCount === "number" &&
    Array.isArray(
      value.inventory.skippedArchiveEntries,
    )
  );
}

export async function readKnowledgeImportReview(
  response: Response,
): Promise<KnowledgeImportReviewResult | null> {
  if (response.status !== 409 && response.status !== 200) {
    return null;
  }

  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);

  return isKnowledgeImportReviewResult(body)
    ? body
    : null;
}

export function isAllDuplicateReview(review: KnowledgeImportReviewResult | null) {
  return Boolean(
    review &&
    review.acceptedFiles.length === 0 &&
    review.reviewFiles.length > 0 &&
    review.reviewFiles.every((file) => file.status === "duplicate") &&
    review.unreadableExistingDocumentIds.length === 0,
  );
}

export function getKnowledgeImportReviewMessage(
  review: KnowledgeImportReviewResult,
): string {
  if (isAllDuplicateReview(review)) {
    return "Todos los archivos son duplicados. No se procesará ninguno. Puedes cerrar esta ventana.";
  }
  const reviewCount = review.reviewFiles.length;
  const unreadableCount =
    review.unreadableExistingDocumentIds.length;

  if (reviewCount === 0 && unreadableCount > 0) {
    return (
      "No se ha iniciado la importación porque no se han podido " +
      "comprobar algunos documentos existentes. " +
      "No se ha guardado ningún archivo nuevo."
    );
  }

  const documentLabel =
    reviewCount === 1
      ? "documento requiere"
      : "documentos requieren";

  return (
    `${reviewCount} ${documentLabel} revisión. ` +
    "No se ha guardado ningún archivo ni se ha iniciado el análisis."
  );
}
