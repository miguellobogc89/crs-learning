// components/knowledge/import/knowledge-import.types.ts

export type KnowledgeImportMode = "files" | "folder" | "zip";

export type KnowledgeImportFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  relativePath: string;
};

export function createKnowledgeImportFile(
  file: File,
): KnowledgeImportFile {
  const fileWithPath = file as File & {
    webkitRelativePath?: string;
  };

  const relativePath =
    fileWithPath.webkitRelativePath?.trim() || file.name;

  return {
    id: [
      relativePath,
      file.size,
      file.lastModified,
    ].join("-"),
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    relativePath,
  };
}

export function mergeKnowledgeImportFiles(
  currentFiles: KnowledgeImportFile[],
  incomingFiles: File[],
): KnowledgeImportFile[] {
  const fileMap = new Map(
    currentFiles.map((file) => [file.id, file]),
  );

  for (const file of incomingFiles) {
    const importFile = createKnowledgeImportFile(file);
    fileMap.set(importFile.id, importFile);
  }

  return Array.from(fileMap.values());
}
