"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Square } from "lucide-react";

import type {
  EnginePreviewEvent, EnginePreviewRunMode, KnowledgeEnginePreview,
} from "@/lib/engine/knowledge-preview/types";
import { automaticPreviewKey } from "@/lib/engine/knowledge-preview/pipeline";

type StreamEvent = EnginePreviewEvent | { type: "heartbeat"; seconds: number };

async function readStream(response: Response, onEvent: (event: StreamEvent) => void) {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `No se pudo iniciar el análisis (HTTP ${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

export type EnginePreviewSnapshot = {importId:string;preview:KnowledgeEnginePreview|null;message:string;seconds:number;error:string|null};

export function EnginePreviewPanel({ importId, onBusyChange, onSnapshotChange }: { importId: string; onBusyChange?: (busy: boolean) => void;onSnapshotChange?:(snapshot:EnginePreviewSnapshot)=>void }) {
  const [preview, setPreview] = useState<KnowledgeEnginePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const attemptedCheckpoints = useRef(new Set<string>());
  const stoppedRef = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/knowledge/import/${encodeURIComponent(importId)}/engine-preview`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as (KnowledgeEnginePreview & { error?: string }) | null;
    if (!response.ok || !body || body.error) throw new Error(body?.error ?? "No se pudo leer el estado de Engine.");
    setPreview(body);
    return body;
  }, [importId]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void refresh().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); controllerRef.current?.abort(); };
  }, [refresh]);

  // A run started elsewhere (another tab) is followed, never duplicated.
  useEffect(() => {
    if (running || preview?.status !== "running") return;
    const timer = setInterval(() => { void refresh().catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [preview?.status, refresh, running]);

  const run = useCallback(async (mode: EnginePreviewRunMode, segmentId?: string) => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true); setError(null); setSeconds(0);
    setMessage(mode === "restart" ? "Reiniciando el análisis" : "Preparando el análisis");
    try {
      const response = await fetch(`/api/knowledge/import/${encodeURIComponent(importId)}/engine-preview`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ mode, segmentId }),
      });
      let terminal = false;
      await readStream(response, event => {
        if (controller.signal.aborted) return;
        if (event.type === "progress") setMessage(event.message);
        else if (event.type === "heartbeat") setSeconds(event.seconds);
        else if (event.type === "state" || event.type === "completed") {
          if (event.type === "completed") terminal = true;
          setPreview(event.preview);
        }
        else if (event.type === "error") { terminal = true; setError(event.error); if (event.preview) setPreview(event.preview); }
      });
      if (!terminal && !controller.signal.aborted) throw new Error("La conexión terminó antes de recibir el resultado. Reanuda para recuperar los checkpoints guardados.");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo analizar Engine.");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setRunning(false);
        if (controller.signal.aborted) void refresh().catch(() => undefined);
      }
    }
  }, [importId, refresh]);

  useEffect(() => {
    if (!preview || loading || running || error || stoppedRef.current) return;
    const key = automaticPreviewKey(preview);
    if (!key || attemptedCheckpoints.current.has(key)) return;
    // Defer so Strict Mode's setup/cleanup probe cannot launch an aborted run.
    const timer = setTimeout(() => {
      attemptedCheckpoints.current.add(key);
      void run("continue");
    }, 0);
    return () => clearTimeout(timer);
  }, [preview, loading, running, error, run]);

  const stop = () => { stoppedRef.current = true; controllerRef.current?.abort(); setMessage("Deteniendo… lo ya verificado se conserva"); };

  useEffect(() => {
    const timer = setTimeout(() => onBusyChange?.(loading || running || preview?.status === "running" || (preview?.status === "idle" && !error)), 0);
    return () => clearTimeout(timer);
  }, [loading, running, preview?.status, error, onBusyChange]);

  useEffect(()=>{onSnapshotChange?.({importId,preview,message,seconds,error});},[importId,preview,message,seconds,error,onSnapshotChange]);

  const busy=loading||running||preview?.status==="running";
  return <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
    {busy ? <><Loader2 className="size-3.5 animate-spin text-blue-600"/><span className="flex-1">{message||"Consultando el análisis de Engine…"}</span>
      {running ? <button type="button" onClick={stop} className="rounded border px-3 py-2"><Square className="mr-1 inline size-3"/>Detener</button> : null}</> : <>
      <span className="flex-1">{error ? "Engine requiere atención. Consulta el resumen." : preview?.status==="not_applicable" ? "Sin candidatos para Engine." : "Análisis actualizado en el resumen."}</span>
      {!preview ? <button type="button" className="rounded border px-3 py-2" onClick={()=>{
        setError(null);setLoading(true);void refresh().catch(cause=>setError(cause instanceof Error?cause.message:String(cause))).finally(()=>setLoading(false));
      }}>Reintentar consulta</button> : null}
      {preview&&preview.status!=="not_applicable"&&preview.status!=="ready" ? <button type="button" className="rounded border px-3 py-2" onClick={()=>{stoppedRef.current=false;void run("continue");}}>Reanudar Engine</button> : null}
      {preview?.documents.filter(document=>document.status==="failed"||document.status==="needs_review").map(document=><button key={document.segmentId} type="button" className="max-w-full truncate rounded border px-3 py-2" title={document.fileName} onClick={()=>void run("retry_document",document.segmentId)}>Reintentar {document.fileName}</button>)}
    </>}
  </div>;
}
