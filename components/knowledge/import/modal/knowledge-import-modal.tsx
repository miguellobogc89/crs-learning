"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import { advanceIntake, type IntakeView } from "../advance-intake";
import { ReadingVerification } from "./reading-verification";
import { CopyButton } from "./copy-button";
import { DocumentClassification } from "./document-classification";
import type { ClassificationResult } from "@/lib/knowledge/intake/classifier/contract";
import type { VerificationReport } from "@/lib/knowledge/intake/verifier/contract";
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
  const labels: Record<string, string> = { lectura_base: "Leyendo el texto de los documentos…", lectura: "Extrayendo contenido de los documentos…", verificacion: "Revisando la lectura contra el documento original…", clasificacion: "Clasificando los documentos…" };
  return <Dialog open={open} onOpenChange={next => { if (!uploading) onOpenChange(next); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogTitle>Subir documentos</DialogTitle>
      <DialogDescription className="sr-only">Extracción del contenido documental y resultado JSON</DialogDescription>
      {!id && <>
        <KnowledgeImportUploadStep files={files} isAnalyzing={uploading} error={error} onFilesChange={setFiles} />
        <Button disabled={uploading || !files.length} onClick={start}>{uploading ? "Subiendo…" : "Procesar documentos"}</Button>
      </>}
      {id && !error && (!view || view.status === "processing") && <p role="status">{labels[view?.phase ?? "lectura_base"]}</p>}
      {(error || view?.error) && <p role="alert">{error || view?.error}</p>}
      {view?.status === "completed" && view.verification?.status !== "processing" && <div className="flex flex-wrap gap-2">
        <CopyButton label="Copiar todo" text={JSON.stringify({ lectura: view.result, revision: view.verification?.result ?? null,
          errorRevision: view.verification?.error ?? null, clasificacion: view.classification?.result ?? null,
          errorClasificacion: view.classification?.error ?? null, lecturaIndependiente: view.verification?.references ?? null }, null, 2)} />
        <CopyButton label="Copiar lectura" text={JSON.stringify(view.result, null, 2)} />
        {view.verification?.status === "completed" && <CopyButton label="Copiar revisión" text={JSON.stringify(view.verification.result, null, 2)} />}
        {view.classification?.status === "completed" && <CopyButton label="Copiar clasificación" text={JSON.stringify(view.classification.result, null, 2)} />}
      </div>}
      {view?.classification?.status === "error" && <p role="alert">No se pudo clasificar: {view.classification.error}</p>}
      {view?.classification?.status === "completed" && <DocumentClassification result={view.classification.result as ClassificationResult} />}
      {view?.verification?.status === "error" && <p role="alert">La lectura está completa, pero no se pudo verificar: {view.verification.error}</p>}
      {view?.verification?.status === "completed" && <ReadingVerification report={view.verification.result as VerificationReport} />}
      {view?.status === "completed" && <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded border p-4 text-xs">{JSON.stringify(view.result, null, 2)}</pre>}
      {view?.verification?.status === "completed" && <details className="rounded border p-4 text-xs"><summary>JSON de la revisión</summary>
        <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap">{JSON.stringify(view.verification.result, null, 2)}</pre></details>}
    </DialogContent>
  </Dialog>;
}
