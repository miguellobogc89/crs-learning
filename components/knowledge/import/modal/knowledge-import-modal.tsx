"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import { advanceIntake, PHASE_NAMES, type IntakeView } from "../advance-intake";
import { ReadingVerification } from "./reading-verification";
import { CopyButton } from "./copy-button";
import { DocumentClassification } from "./document-classification";
import { ExtractedData } from "./extracted-data";
import { ReconciliationView } from "./reconciliation-view";
import { WritePlanView, WriteResultView } from "./write-plan-view";
import type { Decision, WritePlan } from "@/lib/knowledge/intake/writer/plan";
import type { WriteResult } from "@/lib/knowledge/intake/writer/commit";
import type { ReconciliationResult } from "@/lib/knowledge/intake/reconciliation/contract";
import type { TargetedResult } from "@/lib/knowledge/intake/targeted/contract";
import type { ClassificationResult } from "@/lib/knowledge/intake/classifier/contract";
import type { VerificationReport } from "@/lib/knowledge/intake/verifier/contract";
import type { KnowledgeImportModalProps } from "./knowledge-import-modal.types";
async function request(url: string, method?: "POST") {
  const response = await fetch(url, { method: method ?? "GET", cache: "no-store" });
  // A stage that is busy or not ready yet (409) is not a failure: the next poll checks again.
  if (method === "POST" && response.status === 409) return { estado: "ocupado" };
  return read(response);
}
async function read(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación");
  return body;
}
export function KnowledgeImportModal({ open, context, onOpenChange, selectedFiles, resumeImportId, stepwise = false }: KnowledgeImportModalProps) {
  const [files, setFiles] = useState<File[]>(selectedFiles ?? []);
  const [id, setId] = useState<string | null>(resumeImportId ?? null);
  const [view, setView] = useState<IntakeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previousFiles, setPreviousFiles] = useState(selectedFiles);
  // Bumped by "Continuar" in step-by-step mode: restarts polling after starting the next module.
  const [run, setRun] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [saving, setSaving] = useState(false);
  const [previousResume, setPreviousResume] = useState(resumeImportId);
  if (resumeImportId !== previousResume) {
    setPreviousResume(resumeImportId);
    if (resumeImportId) { setId(resumeImportId); setView(null); setError(null); }
  }
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
        const next = await advanceIntake(id!, request, { start: !stepwise });
        if (!alive) return;
        setView(next);
        if (next.status === "processing") timer = setTimeout(poll, 1500);
      } catch(e) { if (alive) setError(e instanceof Error ? e.message : "Error de procesamiento"); }
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, open, run, stepwise]);
  // Saving records is always a person's action, with the decisions taken on the plan.
  async function saveRecords() {
    setSaving(true); setError(null);
    try {
      await read(await fetch(`/api/knowledge/intake/${id}/writing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisiones: decisions }) }));
      setRun(n => n + 1);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); setRun(n => n + 1); }
    finally { setSaving(false); }
  }
  async function continueStep() {
    setError(null);
    try { setView(await advanceIntake(id!, request, { start: true })); setRun(n => n + 1); }
    catch(e) { setError(e instanceof Error ? e.message : "Error de procesamiento"); }
  }
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
  const writingPlan = view?.phase === "escritura" ? view.writing?.plan as WritePlan | null | undefined : null;
  const writingBlocked = writingPlan ? writingPlan.registros.filter(r => r.bloqueo && !(decisions[r.ref] && r.bloqueo.opciones.includes(decisions[r.ref]))).length : 0;
  // Finished results are shown when everything is done, and also while a step-by-step run waits for "Continuar".
  const done = view && view.result !== null && (view.status === "completed" || view.status === "waiting") ? view : null;
  const labels: Record<string, string> = { lectura_base: "Leyendo el texto de los documentos…", lectura: "Extrayendo contenido de los documentos…", verificacion: "Revisando la lectura contra el documento original…", clasificacion: "Clasificando los documentos…", conciliacion: "Comprobando qué datos ya existen…", escritura: "Guardando…" };
  return <Dialog open={open} onOpenChange={next => { if (!uploading) onOpenChange(next); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogTitle>Subir documentos</DialogTitle>
      <DialogDescription className="sr-only">Extracción del contenido documental y resultado JSON</DialogDescription>
      {!id && <KnowledgeImportUploadStep files={files} isAnalyzing={uploading} error={error} onFilesChange={setFiles} />}
      {id && !error && (!view || view.status === "processing") && <p role="status">{labels[view?.phase ?? "lectura_base"]}</p>}
      {id && view?.status === "waiting" && <p role="status">Siguiente paso: <strong>{PHASE_NAMES[view.phase] ?? view.phase}</strong>. Pulsa continuar para ejecutarlo.</p>}
      {id && view?.status === "waiting" && view.phase === "escritura" && view.writing?.plan != null &&
        <WritePlanView plan={view.writing.plan as WritePlan} decisions={decisions} onDecide={(ref, d) => setDecisions(prev => ({ ...prev, [ref]: d }))} />}
      {id && view?.writing?.error && <p role="alert">No se guardó: {view.writing.error}</p>}
      {(!id || view?.status === "waiting") && <Button disabled={uploading || saving || (!id && !files.length) || (writingBlocked > 0)}
        onClick={!id ? start : view!.phase === "escritura" ? saveRecords : continueStep}>
        {!id ? (uploading ? "Subiendo…" : "Procesar documentos") : view!.phase === "escritura"
          ? (saving ? "Guardando…" : writingBlocked > 0 ? `Decide ${writingBlocked} pendiente(s) para guardar` : "Guardar en mis datos")
          : `Continuar: ${PHASE_NAMES[view!.phase] ?? view!.phase}`}</Button>}
      {(error || view?.error) && <p role="alert">{error || view?.error}</p>}
      {done && done.verification?.status !== "processing" && <div className="flex flex-wrap gap-2">
        <CopyButton label="Copiar todo" text={JSON.stringify({ lectura: done.result, revision: done.verification?.result ?? null,
          errorRevision: done.verification?.error ?? null, clasificacion: done.classification?.result ?? null,
          errorClasificacion: done.classification?.error ?? null, conciliacion: done.reconciliation?.result ?? null,
          errorConciliacion: done.reconciliation?.error ?? null, escritura: done.writing?.result ?? done.writing?.plan ?? null,
          lecturaIndependiente: done.verification?.references ?? null }, null, 2)} />
        {done.reconciliation?.status === "completed" && <CopyButton label="Copiar conciliación" text={JSON.stringify(done.reconciliation.result, null, 2)} />}
        <CopyButton label="Copiar lectura" text={JSON.stringify(done.result, null, 2)} />
        {done.verification?.status === "completed" && <CopyButton label="Copiar revisión" text={JSON.stringify(done.verification.result, null, 2)} />}
        {done.classification?.status === "completed" && <CopyButton label="Copiar clasificación" text={JSON.stringify(done.classification.result, null, 2)} />}
      </div>}
      {view?.classification?.status === "error" && <p role="alert">No se pudo clasificar: {view.classification.error}</p>}
      {view?.classification?.status === "completed" && <DocumentClassification result={view.classification.result as ClassificationResult} />}
      {view?.verification?.status === "error" && <p role="alert">La lectura está completa, pero no se pudo verificar: {view.verification.error}</p>}
      {view?.verification?.status === "completed" && <ReadingVerification report={view.verification.result as VerificationReport} />}
      {done && (done.result as { module?: string } | null)?.module === "targeted_extraction" && <ExtractedData result={done.result as TargetedResult} />}
      {view?.reconciliation?.status === "error" && <p role="alert">No se pudo conciliar: {view.reconciliation.error}</p>}
      {done && done.writing?.status === "completed" && <WriteResultView result={done.writing.result as WriteResult} />}
      {done && done.reconciliation?.status === "completed" && <ReconciliationView result={done.reconciliation.result as ReconciliationResult} />}
      {done && <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded border p-4 text-xs">{JSON.stringify(done.result, null, 2)}</pre>}
      {view?.verification?.status === "completed" && <details className="rounded border p-4 text-xs"><summary>JSON de la revisión</summary>
        <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap">{JSON.stringify(view.verification.result, null, 2)}</pre></details>}
    </DialogContent>
  </Dialog>;
}
