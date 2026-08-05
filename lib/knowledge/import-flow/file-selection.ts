
import {
  isSupportedKnowledgeArchive,
} from "./supported-formats";

export function getBrowserFileIdentity(
  file: File,
) {
  return [
    file.name.toLowerCase(),
    file.size,
    file.lastModified,
  ].join("::");
}

export function getBrowserFileRelativePath(
  file: File,
) {
  const fileWithRelativePath = file as File & {
    webkitRelativePath?: string;
  };

  return (
    fileWithRelativePath.webkitRelativePath ||
    file.name
  );
}

export function getBrowserImportMode(
  files: File[],
) {
  if (
    files.length === 1 &&
    isSupportedKnowledgeArchive(
      files[0].name,
      files[0].type,
    )
  ) {
    return "zip" as const;
  }

  if (
    files.some((file) =>
      getBrowserFileRelativePath(
        file,
      ).includes("/"),
    )
  ) {
    return "folder" as const;
  }

  return "files" as const;
}

export function deduplicateBrowserFiles(
  files: File[],
) {
  const seenFiles = new Set<string>();
  const uniqueFiles: File[] = [];
  const duplicateFiles: File[] = [];

  for (const file of files) {
    const identity =
      getBrowserFileIdentity(file);

    if (seenFiles.has(identity)) {
      duplicateFiles.push(file);
      continue;
    }

    seenFiles.add(identity);
    uniqueFiles.push(file);
  }

  return {
    uniqueFiles,
    duplicateFiles,
  };
}
