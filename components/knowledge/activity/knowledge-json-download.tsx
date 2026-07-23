// components/knowledge/activity/knowledge-json-download.tsx
"use client";

import { Download } from "lucide-react";

type KnowledgeJsonDownloadProps = {
  data: unknown;
  fileName: string;
  label?: string;
};

export function KnowledgeJsonDownload({
  data,
  fileName,
  label = "Descargar JSON",
}: KnowledgeJsonDownloadProps) {
  function handleDownload() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName.endsWith(".json")
      ? fileName
      : `${fileName}.json`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  );
}