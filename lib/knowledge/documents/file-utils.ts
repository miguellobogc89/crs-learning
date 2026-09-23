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
    case "odt":
    case "rtf":
      return "/icons/files/doc.png";

    case "xls":
    case "xlsx":
    case "xlsm":
    case "ods":
    case "csv":
      return "/icons/files/xls.png";

    case "ppt":
    case "pptx":
    case "odp":
      return "/icons/files/pptx.png";

    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
    case "svg":
      return "/icons/files/jpg.png";

    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return "/icons/files/zip.png";

    default:
      return "/icons/files/clip.png";
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