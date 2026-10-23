/** Lightweight persisted inventory. One queued source at a time; no Engine writes. */
export type InventoryDocument = {
  id: string;
  fileId: string;
  fileName: string;
  type: string;
  category: string;
  title: string;
  startLine: number;
  endLine: number;
  confidence: "high" | "medium" | "low";
  /** Routing proposal only: no articles, tables or Engine records are written here. */
  routing?: {
    knowledge: true;
    articleCandidate: boolean;
    structuredCandidate: boolean;
    reason: string;
    structuredFields: string[];
    existingArticleId: string | null;
    existingStructureKeys: string[];
  };
};
export type InventoryFile = {
  fileId: string;
  fileName: string;
  sourceChars: number;
  status: "completed" | "error";
  documentIds: string[];
  error?: string;
};
export type ImportInventory = {
  format: "crs-import-map";
  version: 3;
  importId: string;
  stage: "document_inventory";
  status: "in_progress" | "completed" | "completed_with_issues";
  methodology: "queued semantic document inventory";
  files: InventoryFile[];
  documents: InventoryDocument[];
  summary: { filesProcessed: number; documentsIdentified: number; byType: Array<{ type: string; count: number }>; byCategory: Array<{ category: string; count: number }> };
  writesPerformed: { engine: false; knowledge: false };
};
export function emptyImportInventory(importId: string): ImportInventory {
  return {
    format: "crs-import-map", version: 3, importId,
    stage: "document_inventory", status: "in_progress",
    methodology: "queued semantic document inventory",
    files: [], documents: [],
    summary: { filesProcessed: 0, documentsIdentified: 0, byType: [], byCategory: [] },
    writesPerformed: { engine: false, knowledge: false },
  };
}
export function appendInventoryFile(
  previous: ImportInventory,
  file: InventoryFile,
  documents: InventoryDocument[],
): ImportInventory {
  // Replaying the same file replaces its earlier result, never duplicates it.
  const files = [...previous.files.filter(item => item.fileId !== file.fileId), file];
  const allDocuments = [...previous.documents.filter(item => item.fileId !== file.fileId), ...documents];
  const count = (key: "type" | "category") => {
    const grouped = new Map<string, number>();
    for (const doc of allDocuments) grouped.set(doc[key], (grouped.get(doc[key]) ?? 0) + 1);
    return [...grouped.entries()].map(([name, total]) => ({ [key]: name, count: total }));
  };
  return {
    ...previous, files, documents: allDocuments,
    summary: {
      filesProcessed: files.length,
      documentsIdentified: allDocuments.length,
      byType: count("type") as Array<{ type: string; count: number }>,
      byCategory: count("category") as Array<{ category: string; count: number }>,
    },
  };
}
