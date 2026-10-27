"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads the import log as a JSON file. Not a processing action: it never calls the server. */
export function DownloadLogButton({ build, fileName }: { build: () => unknown; fileName: () => string }) {
  function download() {
    const blob = new Blob([JSON.stringify(build(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = fileName();
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Button variant="outline" size="sm" onClick={download} className="gap-1.5"><Download className="size-3.5" />Descargar log</Button>;
}
