"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import { advanceIntake, type IntakeView } from "../advance-intake";
import type { KnowledgeImportModalProps } from "./knowledge-import-modal.types";
async function read(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación");
  return body;
}
export function KnowledgeImportModal({ open, context, onOpenChange, selectedFiles, resumeImportId }: KnowledgeImportModalProps) {
  const [files, setFiles] = useState<File[]>(selectedFiles ?? []);
  const [id, setId] = useState<string | null>(resumeImportId ?? null);
  const [view, setView] = useState<IntakeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previousFiles, setPreviousFiles] = useState(selectedFiles);
  if (selectedFiles !== previousFiles) {
    setPreviousFiles(selectedFiles);
    if (selectedFiles?.length) { setFiles(selectedFiles); setId(null); setView(null); setError(null); }
  }
  useEffect(() => {
    if (!open || !id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await advanceIntake(id!, async (url, method) => read(await fetch(url, { method: method ?? "GET", cache: "no-store" })));
        if (!alive) return;
        setView(next);
        if (next.status === "processing") timer = setTimeout(poll, 1500);
      } catch(e) { if (alive) setError(e instanceof Error ? e.message : "Error de procesamiento"); }
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, open]);
  async function start() {
    if (!context || !files.length) return;
    setUploading(true); setError(null); setView(null);
    try {
      const data = new FormData(); data.set("libraryId", context.libraryId);
      files.forEach(file => data.append("files", file));
      const result = await read(await fetch("/api/knowledge/intake", { method: "POST", body: data }));
      setId(result.loteId);
    } catch(e) { setError(e instanceof Error ? e.message : "Error de subida"); }
    finally { setUploading(false); }
  }
  const labels: Record<string, string> = { lectura: "Leyendo archivos…", identificacion: "Identificando documentos…", clasificacion: "Clasificando contenido…", estructuras: "Identificando tablas y relaciones…" };
  return <Dialog open={open} onOpenChange={next => { if (!uploading) onOpenChange(next); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogTitle>Subir documentos</DialogTitle>
      <DialogDescription className="sr-only">Procesamiento del lote y resultado JSON</DialogDescription>
      {!id && <>
        <KnowledgeImportUploadStep files={files} isAnalyzing={uploading} error={error} onFilesChange={setFiles} />
        <Button disabled={uploading || !files.length} onClick={start}>{uploading ? "Subiendo…" : "Procesar documentos"}</Button>
      </>}
      {id && !error && (!view || view.status === "processing") && <p role="status">{labels[view?.phase ?? "lectura"]}</p>}
      {(error || view?.error) && <p role="alert">{error || view?.error}</p>}
      {view?.status === "completed" && <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded border p-4 text-xs">{JSON.stringify(view.result, null, 2)}</pre>}
    </DialogContent>
  </Dialog>;
}
