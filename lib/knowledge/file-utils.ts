// lib/knowledge/file-utils.ts
export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getKnowledgeFileType(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function getKnowledgeFileIcon(filename: string) {
  switch (getKnowledgeFileType(filename)) {
    case "docx":
      return "📝";

    case "xlsx":
      return "📊";

    case "csv":
      return "📊";

    case "pptx":
      return "📈";

    case "pdf":
      return "📕";

    case "txt":
      return "📄";

    case "md":
      return "📄";

    default:
      return "📁";
  }
}

export function getKnowledgeStatus(status: string) {
  switch (status) {
    case "processed":
      return "Listo";

    case "processing":
      return "Procesando";

    case "error":
      return "Error";

    default:
      return status;
  }
}