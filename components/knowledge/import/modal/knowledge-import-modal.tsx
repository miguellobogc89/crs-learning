"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileStack } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import { advanceIntake, PHASE_NAMES, type IntakeView } from "../advance-intake";
import { ReadingVerification } from "./reading-verification";
import { CopyButton } from "./copy-button";
import { DownloadLogButton } from "./download-log-button";
import { PipelineStepper, StepCard } from "./pipeline-stepper";
import { deriveSteps } from "./pipeline-steps";
import { buildImportLog, logFileName, type LogEvent } from "./import-log";
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
  // Timeline of this window for the downloadable log (debugging).
  const events = useRef<LogEvent[]>([]);
  const log = (type: LogEvent["type"], detail: string) => { events.current.push({ at: new Date().toISOString(), type, detail }); };
  const lastState = useRef("");
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
        const state = `${next.phase}:${next.status}${next.error ? `:${next.error}` : ""}`;
        if (state !== lastState.current) { lastState.current = state; log(next.status === "error" ? "error" : "estado", `${next.phase} → ${next.status}${next.error ? ` (${next.error})` : ""}`); }
        setView(next);
        if (next.status === "processing") timer = setTimeout(poll, 1500);
      } catch(e) { if (alive) { const message = e instanceof Error ? e.message : "Error de procesamiento"; log("error", message); setError(message); } }
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, open, run, stepwise]);
  // Saving records is always a person's action, with the decisions taken on the plan.
  async function saveRecords() {
    setSaving(true); setError(null);
    log("accion", `guardar con decisiones ${JSON.stringify(decisions)}`);
    try {
      await read(await fetch(`/api/knowledge/intake/${id}/writing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisiones: decisions }) }));
      setRun(n => n + 1);
    } catch(e) { const message = e instanceof Error ? e.message : "No se pudo guardar"; log("error", message); setError(message); setRun(n => n + 1); }
    finally { setSaving(false); }
  }
  async function continueStep() {
    setError(null);
    log("accion", `continuar: ${view?.phase}`);
    try { setView(await advanceIntake(id!, request, { start: true, retry: view?.status === "error" && view.phase === "lectura" })); setRun(n => n + 1); }
    catch(e) { setError(e instanceof Error ? e.message : "Error de procesamiento"); }
  }
  async function start() {
    if (!context || !files.length) return;
    setUploading(true); setError(null); setView(null);
    try {
      const data = new FormData(); data.set("libraryId", context.libraryId);
      files.forEach(file => data.append("files", file));
      log("accion", `subir ${files.length} archivo(s): ${files.map(f => f.name).join(", ")}`);
      const result = await read(await fetch("/api/knowledge/intake", { method: "POST", body: data }));
      log("estado", `lote creado ${result.loteId}`);
      setId(result.loteId);
    } catch(e) { setError(e instanceof Error ? e.message : "Error de subida"); }
    finally { setUploading(false); }
  }
  const writingPlan = view?.phase === "escritura" ? view.writing?.plan as WritePlan | null | undefined : null;
  const writingBlocked = writingPlan ? writingPlan.registros.filter(r => r.bloqueo && !(decisions[r.ref] && r.bloqueo.opciones.includes(decisions[r.ref]))).length : 0;
  // Finished results are shown when everything is done, and also while a step-by-step run waits for "Continuar".
  const done = view && view.result !== null && (view.status === "completed" || view.status === "waiting") ? view : null;
  const steps = deriveSteps(view, uploading);
  const labels: Record<string, string> = { lectura_base: "Leyendo el texto de los documentos…", lectura: "Extrayendo los datos útiles…", verificacion: "Revisando cada dato contra el documento…", clasificacion: "Clasificando los documentos…", conciliacion: "Comprobando qué datos ya existen…", escritura: "Guardando…" };
  const status = !id ? (uploading ? "Subiendo…" : files.length ? `${files.length} archivo(s) listos para procesar` : "Añade los documentos que quieras importar")
    : error ? "Se ha detenido por un error" : !view ? "Consultando el estado…"
    : view.status === "processing" ? labels[view.phase] ?? "Procesando…"
    : view.status === "waiting" ? (view.phase === "escritura" ? (writingBlocked ? `Revisa ${writingBlocked} decisión(es) antes de guardar` : "Todo listo para guardar en tus datos") : `Siguiente paso: ${PHASE_NAMES[view.phase] ?? view.phase}`)
    : view.status === "completed" ? (view.writing?.status === "completed" ? "Importación completada y guardada" : "Importación completada") : "Con errores";
  const detail: Record<string, ReactNode> = {
    clasificacion: view?.classification?.status === "completed" ? <DocumentClassification result={view.classification.result as ClassificationResult} /> : null,
    lectura: done ? ((done.result as { module?: string } | null)?.module === "targeted_extraction" ? <ExtractedData result={done.result as TargetedResult} />
      : <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(done.result, null, 2)}</pre>) : null,
    verificacion: view?.verification?.status === "completed" ? <ReadingVerification report={view.verification.result as VerificationReport} /> : null,
    conciliacion: done?.reconciliation?.status === "completed" ? <ReconciliationView result={done.reconciliation.result as ReconciliationResult} /> : null,
    escritura: done?.writing?.status === "completed" ? <WriteResultView result={done.writing.result as WriteResult} /> : null,
  };
  const bundle = () => buildImportLog(id, events.current, view);
  return <Dialog open={open} onOpenChange={next => { if (!uploading && !saving) onOpenChange(next); }}>
    <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 pb-4 pt-5 pr-12">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0A58FF]"><FileStack className="size-5" /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-slate-900">Importar documentos</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {id ? `Lote ${id.slice(0, 8)}${stepwise ? " · paso a paso" : ""}` : "Facturas, tickets, contratos, tarifas… Se leen, se revisan y tú decides qué se guarda."}
            </DialogDescription>
          </div>
        </div>
        {id && <div className="flex flex-wrap gap-2">
          <CopyButton label="Copiar todo" text={JSON.stringify(bundle(), null, 2)} />
          <DownloadLogButton build={bundle} fileName={() => logFileName(id)} />
        </div>}
      </div>
      {(id || uploading) && <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4"><PipelineStepper steps={steps} /></div>}
      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {!id && <KnowledgeImportUploadStep files={files} isAnalyzing={uploading} error={error} onFilesChange={setFiles} />}
        {id && (error || view?.error) && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error || view?.error}</div>}
        {id && view?.writing?.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">No se guardó: {view.writing.error}</div>}
        {id && view?.status === "waiting" && view.phase === "escritura" && view.writing?.plan != null &&
          <WritePlanView plan={view.writing.plan as WritePlan} decisions={decisions} onDecide={(ref, d) => { log("accion", `decisión ${ref} → ${d}`); setDecisions(prev => ({ ...prev, [ref]: d })); }} />}
        {id && steps.map((step, i) => <StepCard key={step.key} step={step} index={i} open={step.key === "escritura" && step.state === "done"}>{detail[step.key] ?? undefined}</StepCard>)}
        {done && <details className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
          <summary className="cursor-pointer font-medium">Datos técnicos</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton label="Copiar lectura" text={JSON.stringify(done.result, null, 2)} />
            {done.classification?.status === "completed" && <CopyButton label="Copiar clasificación" text={JSON.stringify(done.classification.result, null, 2)} />}
            {done.verification?.status === "completed" && <CopyButton label="Copiar revisión" text={JSON.stringify(done.verification.result, null, 2)} />}
            {done.reconciliation?.status === "completed" && <CopyButton label="Copiar conciliación" text={JSON.stringify(done.reconciliation.result, null, 2)} />}
          </div>
          <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap">{JSON.stringify(done.result, null, 2)}</pre>
        </details>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-3">
        <p role="status" className="text-xs text-slate-500">{status}</p>
        {(!id || view?.status === "waiting" || (view?.status === "error" && view.phase === "lectura")) && <Button disabled={uploading || saving || (!id && !files.length) || (writingBlocked > 0)}
          onClick={!id ? start : view!.phase === "escritura" ? saveRecords : continueStep}>
          {!id ? (uploading ? "Subiendo…" : "Procesar documentos") : view!.phase === "escritura"
            ? (saving ? "Guardando…" : writingBlocked > 0 ? `Decide ${writingBlocked} pendiente(s)` : "Guardar en mis datos")
            : `Continuar: ${PHASE_NAMES[view!.phase] ?? view!.phase}`}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
