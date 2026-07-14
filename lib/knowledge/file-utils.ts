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
    case "pdf":
      return "/icons/files/pdf.png";

    case "doc":
    case "docx":
      return "/icons/files/docx.png";

    case "xls":
    case "xlsx":
      return "/icons/files/xlsx.png";

    case "ppt":
    case "pptx":
      return "/icons/files/pptx.png";

    case "csv":
      return "/icons/files/csv.png";

    case "txt":
      return "/icons/files/txt.png";

    case "md":
      return "/icons/files/md.png";

    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
      return "/icons/files/image.png";

    default:
      return "/icons/files/file.png";
  }
}

export function isKnowledgeFileIconImage(
  filename: string,
) {
  return getKnowledgeFileIcon(filename).startsWith(
    "/icons/",
  );
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