// components/knowledge/intake/services/create-selected-documents.ts

export type SelectedKnowledgeDocument = {
  id: string;
  file: File;
};

export function createSelectedDocuments(
  files: File[],
  currentDocuments: SelectedKnowledgeDocument[],
) {
  return files.map((file) => {
    const existing = currentDocuments.find(
      (document) =>
        document.file.name === file.name &&
        document.file.size === file.size &&
        document.file.lastModified ===
          file.lastModified,
    );

    return (
      existing ?? {
        id: crypto.randomUUID(),
        file,
      }
    );
  });
}