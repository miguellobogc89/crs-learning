
// lib/knowledge/import/pipeline/types.ts

/**
 * Contrato compartido del pipeline de importación de Knowledge.
 *
 * Este archivo no sube, extrae ni analiza documentos.
 * Define las entradas y los resultados que utilizarán
 * las distintas etapas del pipeline.
 */

export type KnowledgeImportSource =
  | "file"
  | "folder"
  | "archive";

export type KnowledgeImportStage =
  | "detecting-format"
  | "extracting"
  | "checking-duplicates"
  | "ready-for-analysis"
  | "analyzing"
  | "completed"
  | "failed";

export type KnowledgeImportRejectionReason =
  | "unsupported-format"
  | "duplicate-in-selection"
  | "duplicate-in-knowledge"
  | "invalid-file"
  | "extraction-error";

export type KnowledgeImportFileIdentity = {
  /**
   * Nombre del documento, sin incluir la ruta de la carpeta
   * o del archivo comprimido que lo contiene.
   */
  fileName: string;

  /**
   * Ruta relativa dentro de la selección, carpeta o ZIP.
   * Para archivos sueltos puede coincidir con fileName.
   */
  relativePath: string;

  size: number;

  /**
   * Tipo MIME detectado. No debe considerarse fiable
   * únicamente por proceder del navegador.
   */
  mimeType: string | null;

  /**
   * Hash del contenido, cuando se haya calculado.
   * No es obligatorio calcularlo para rechazar un archivo
   * mediante una comprobación previa más barata.
   */
  contentHash?: string;
};

export type KnowledgeImportCandidate = {
  /**
   * Identificador temporal dentro de una ejecución.
   * No equivale al ID del documento en la base de datos.
   */
  candidateId: string;

  source: KnowledgeImportSource;

  identity: KnowledgeImportFileIdentity;

  /**
   * Identificador del archivo contenedor, cuando proceda.
   * Por ejemplo, el ZIP del que se ha obtenido el documento.
   */
  containerId?: string;
};

export type KnowledgeImportAcceptedFile = {
  candidate: KnowledgeImportCandidate;

  status: "accepted";
};

export type KnowledgeImportRejectedFile = {
  candidate: KnowledgeImportCandidate;

  status: "rejected";

  reason: KnowledgeImportRejectionReason;

  /**
   * Mensaje legible para mostrar al usuario.
   */
  message: string;

  /**
   * ID del documento existente cuando la comprobación
   * de duplicados permita identificarlo.
   */
  existingKnowledgeFileId?: string;
};

export type KnowledgeImportDecision =
  | KnowledgeImportAcceptedFile
  | KnowledgeImportRejectedFile;

export type KnowledgeImportPreflightResult = {
  accepted: KnowledgeImportAcceptedFile[];

  rejected: KnowledgeImportRejectedFile[];
};