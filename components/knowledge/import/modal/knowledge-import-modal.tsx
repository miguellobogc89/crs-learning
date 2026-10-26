"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import type { KnowledgeImportModalProps } from "./knowledge-import-modal.types";
type State = { loteId: string; estado: string; fase: string; error: string | null; resultado: unknown; recuperable: boolean };
async function read(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación");
  return body;
}
export function KnowledgeImportModal({ open, context, onOpenChange, selectedFiles, resumeImportId }: KnowledgeImportModalProps) {
  const [files, setFiles] = useState<File[]>(selectedFiles ?? []);
  const [id, setId] = useState<string | null>(resumeImportId ?? null);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<{id: string; status: string; created_at: string}[]>([]);
  const [previousFiles, setPreviousFiles] = useState(selectedFiles);
  if (selectedFiles !== previousFiles) {
    setPreviousFiles(selectedFiles);
    if (selectedFiles?.length) { setFiles(selectedFiles); setId(null); setState(null); setError(null); }
  }
  const libraryId = context?.libraryId;
  useEffect(() => {
    if (!open || !libraryId) return;
    let alive = true;
    fetch(`/api/knowledge/intake?libraryId=${encodeURIComponent(libraryId)}`).then(read).then(data => { if(alive) setHistory(data); }).catch(e => { if(alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, libraryId]);
  useEffect(() => {
    if (!open || !id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next: State = await read(await fetch(`/api/knowledge/intake/${id}`, { cache: "no-store" }));
        if (!alive) return;
        setState(next);
        if (next.estado === "intake_pending") await read(await fetch(`/api/knowledge/intake/${id}`, { method: "POST" }));
        if (alive && !["intake_completed", "intake_error"].includes(next.estado)) timer = setTimeout(poll, 1500);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Error de conexión"); }
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, open]);
  async function start() {
    if (!context || !files.length) return;
    setUploading(true); setError(null); setState(null);
    try {
      const data = new FormData(); data.set("libraryId", context.libraryId);
      files.forEach(file => data.append("files", file));
      const result = await read(await fetch("/api/knowledge/intake", { method: "POST", body: data }));
      setId(result.loteId);
    } catch(e) { setError(e instanceof Error ? e.message : "Error de subida"); }
    finally { setUploading(false); }
  }
  async function retry() {
    if (!id) return;
    try {
      setError(null);
      await read(await fetch(`/api/knowledge/intake/${id}`, { method: "POST" }));
      const current = id; setId(null); setState(null); setTimeout(() => setId(current), 0);
    } catch(e) { setError(e instanceof Error ? e.message : "Error al reintentar"); }
  }
  const json = state?.resultado ? JSON.stringify(state.resultado, null, 2) : null;
  return <Dialog open={open} onOpenChange={next => { if (!uploading) onOpenChange(next); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogTitle>Identificación y clasificación</DialogTitle>
      <DialogDescription className="sr-only">Inventario del lote en JSON</DialogDescription>
      {!id && <>
        <KnowledgeImportUploadStep files={files} isAnalyzing={uploading} error={error} onFilesChange={setFiles} />
        <Button disabled={uploading || !files.length} onClick={start}>{uploading ? "Subiendo…" : "Procesar lote"}</Button>
        {history.length > 0 && <select aria-label="Recuperar lote" defaultValue="" onChange={e => { setError(null); setState(null); setId(e.target.value); }}>
          <option value="" disabled>Recuperar lote anterior</option>
          {history.map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.status}</option>)}
        </select>}
      </>}
      {id && !json && <p role="status">{state?.fase === "lectura" ? "Leyendo archivos" : state?.fase === "clasificacion" ? "2 · Clasificación" : "1 · Identificación"}{state?.estado === "intake_error" ? " · Error" : "…"}</p>}
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
      {id && (error || state?.estado === "intake_error" || state?.recuperable) && <Button onClick={retry}>Reintentar fase pendiente</Button>}
      {json && <>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border p-4 text-xs">{json}</pre>
        <Button onClick={() => { const url = URL.createObjectURL(new Blob([json], { type: "application/json" })); const a = document.createElement("a"); a.href=url; a.download=`lote-${id}.json`; a.click(); URL.revokeObjectURL(url); }}>Descargar JSON</Button>
      </>}
      {id && <Button variant="outline" onClick={() => { setId(null); setState(null); setError(null); }}>Nuevo lote</Button>}
    </DialogContent>
  </Dialog>;
}
