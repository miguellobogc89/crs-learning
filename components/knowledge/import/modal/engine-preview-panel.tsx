"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Database, Loader2, RotateCcw, Square } from "lucide-react";

import type {
  EnginePreviewDocument, EnginePreviewEvent, EnginePreviewRunMode, KnowledgeEnginePreview,
} from "@/lib/engine/knowledge-preview/types";
import type { ExtractedRecord } from "@/lib/engine/knowledge-preview/extraction";
import type { PreviewEntity } from "@/lib/engine/knowledge-preview/schema";
import { automaticPreviewKey } from "@/lib/engine/knowledge-preview/pipeline";
import { engineReports } from "@/lib/engine/knowledge-preview/reports";
import { ImportPhaseReport } from "./import-phase-report";

type StreamEvent = EnginePreviewEvent | { type: "heartbeat"; seconds: number };

const STATUS_LABEL: Record<KnowledgeEnginePreview["status"], { text: string; tone: string }> = {
  not_applicable: { text: "Sin datos estructurados", tone: "border-slate-200 bg-slate-50 text-slate-600" },
  idle: { text: "Pendiente de analizar", tone: "border-slate-200 bg-slate-50 text-slate-600" },
  running: { text: "Analizando", tone: "border-blue-200 bg-blue-50 text-blue-700" },
  schema_failed: { text: "Esquema no válido", tone: "border-rose-200 bg-rose-50 text-rose-700" },
  incomplete: { text: "Análisis incompleto", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  needs_review: { text: "Requiere revisión", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  ready: { text: "Todo verificado", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};
const DOCUMENT_LABEL: Record<EnginePreviewDocument["status"], { text: string; tone: string }> = {
  pending: { text: "Pendiente", tone: "bg-slate-100 text-slate-600" },
  verified: { text: "Verificado", tone: "bg-emerald-50 text-emerald-700" },
  needs_review: { text: "Revisar", tone: "bg-amber-50 text-amber-800" },
  failed: { text: "Sin respuesta válida", tone: "bg-rose-50 text-rose-700" },
};
const ORIGIN_LABEL = { catalog: "catálogo", workspace: "workspace", new: "nuevo" } as const;
const TYPE_LABEL: Record<string, string> = {
  text: "texto", long_text: "texto largo", integer: "entero", decimal: "decimal", boolean: "sí/no",
  date: "fecha", datetime: "fecha y hora", enum: "lista",
};
const CARDINALITY_LABEL = { one_to_one: "uno a uno", one_to_many: "uno a muchos", many_to_many: "muchos a muchos" } as const;

function formatValue(value: string | number | boolean, type: string | undefined) {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return value.toLocaleString("es-ES", { maximumFractionDigits: 6 });
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  return value;
}

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

function RecordTable({ entity, records }: { entity: PreviewEntity; records: ExtractedRecord[] }) {
  const columns = entity.fields.filter(field => records.some(record => record.values[field.key]));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-slate-800">{entity.name} <span className="font-normal text-slate-400">· {records.length}</span></p>
      <div className="mt-1 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-max border-collapse text-left text-[11px]">
          <thead className="bg-slate-50 text-[10px] text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">Ref.</th>
              {columns.map(field => <th key={field.key} className="px-2 py-1.5 font-medium">{field.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr key={record.ref} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">{record.ref}</td>
                {columns.map(field => {
                  const value = record.values[field.key];
                  const id = record.ref + "." + field.key;
                  return (
                    <td key={field.key} className="px-2 py-1.5 text-slate-800">
                      {value ? (
                        <button
                          type="button"
                          onClick={() => setOpen(open === id ? null : id)}
                          title={`Línea ${value.evidence.lineStart}: «${value.evidence.text}»`}
                          className="rounded text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:bg-blue-50"
                        >
                          {formatValue(value.value, field.type)}
                        </button>
                      ) : <span className="text-slate-300">—</span>}
                      {value && open === id ? (
                        <p className="mt-1 max-w-xs rounded bg-blue-50 px-1.5 py-1 text-[10px] text-slate-600">
                          L{value.evidence.lineStart}{value.evidence.lineEnd !== value.evidence.lineStart ? "–" + value.evidence.lineEnd : ""} · «{value.evidence.text}»
                        </p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentCard({ document, preview, busy, onRetry }: {
  document: EnginePreviewDocument; preview: KnowledgeEnginePreview; busy: boolean; onRetry: () => void;
}) {
  const label = DOCUMENT_LABEL[document.status];
  const errors = document.issues.filter(issue => issue.severity === "error");
  const schema = preview.schema;
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={document.status === "needs_review" || document.status === "failed"}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
        <ChevronRight className="size-3.5 shrink-0 text-slate-400 transition group-open:rotate-90" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-slate-900">{document.title}</p>
          <p className="truncate text-[10px] text-slate-500">{document.fileName} · líneas {document.startLine}–{document.endLine} · {document.records.length} registros</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${label.tone}`}>{label.text}</span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-3 py-3">
        {document.error ? <p className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">{document.error}</p> : null}
        {errors.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="text-[11px] font-semibold text-amber-900">{errors.length} {errors.length === 1 ? "valor rechazado" : "comprobaciones no superadas"}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-amber-800">
              {errors.map((issue, index) => <li key={index}>{issue.message}</li>)}
            </ul>
            <p className="mt-1 text-[10px] text-amber-700">Los valores rechazados no se muestran ni se usarán. El resto sí está verificado contra la fuente.</p>
          </div>
        ) : null}
        {document.warnings.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-slate-500">
            {document.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        ) : null}
        {schema ? schema.entities.map(entity => {
          const records = document.records.filter(record => record.entity === entity.key);
          return records.length ? <RecordTable key={entity.key} entity={entity} records={records} /> : null;
        }) : null}
        {document.links.length && schema ? (
          <div>
            <p className="text-[11px] font-semibold text-slate-800">Vínculos</p>
            <ul className="mt-1 space-y-1 text-[10px] text-slate-600">
              {document.links.map((link, index) => {
                const relation = schema.relations.find(item => item.key === link.relation);
                return (
                  <li key={index} className="rounded bg-slate-50 px-2 py-1">
                    <span className="font-mono">{link.from}</span> → <span className="font-mono">{link.to}</span> · {relation?.name ?? link.relation}
                    {link.roleEvidence ? <span className="text-slate-500"> · L{link.roleEvidence.lineStart} «{link.roleEvidence.text}»</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {document.status !== "verified" || errors.length ? (
          <button
            type="button" onClick={onRetry} disabled={busy}
            title={busy ? "Espera a que termine el análisis en curso" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="size-3" /> Reintentar este documento
          </button>
        ) : null}
      </div>
    </details>
  );
}

export function EnginePreviewPanel({ importId, onBusyChange }: { importId: string; onBusyChange?: (busy: boolean) => void }) {
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

  if (loading) {
    return <p className="text-[11px] text-slate-500"><Loader2 className="mr-1.5 inline size-3 animate-spin" />Consultando Engine…</p>;
  }
  if (!preview) {
    return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
      {error ?? "No se pudo leer Engine."}
      <button type="button" className="ml-2 rounded border px-2 py-1" onClick={() => {
        setError(null); setLoading(true);
        void refresh().catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false));
      }}>Reintentar consulta</button>
    </div>;
  }
  if (preview.status === "not_applicable") {
    return (
      <ImportPhaseReport report={{ title: "3 · Engine sin candidatos", status: "Validado",
        input: "Destinos de la revisión conjunta.", validation: "Ningún segmento está marcado para extracción estructurada.",
        text: "No se ejecutan esquema, extracción ni conciliación en Engine. Los documentos y artículos siguen propuestos para Knowledge. No se ha importado nada todavía." }} />
    );
  }

  const busy = running || preview.status === "running";
  const status = STATUS_LABEL[busy ? "running" : preview.status];
  const verified = preview.documents.filter(document => document.status === "verified").length;
  const schema = preview.schema;
  const topLevel = schema ? schema.entities.filter(entity => !entity.ownedBy) : [];
  const unsupported = preview.support?.unsupported;

  return (
    <div className="space-y-4">
      {engineReports(preview).map(report => <ImportPhaseReport key={report.title} report={report} />)}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-[11px] leading-5 text-slate-600">
            Engine propone tablas comunes, extrae cada documento y comprueba cada valor contra su línea de origen.
            <strong className="font-semibold text-slate-800"> Es una vista previa: todavía no se guarda nada en Engine.</strong> Al confirmar la incorporación se guardan los documentos y artículos de Knowledge.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${status.tone}`}>{status.text}</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {busy ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-[11px] text-blue-700">
              <Loader2 className="mr-1.5 inline size-3 animate-spin" />
              {running ? message || "Analizando" : "Hay un análisis en curso en otra ventana; se actualizará al terminar"}{running && seconds ? ` · ${seconds} s` : ""}
            </p>
            {running ? (
              <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                <Square className="size-3" /> Detener
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              {preview.status === "idle" ? `${preview.documents.length} ${preview.documents.length === 1 ? "documento estructurado" : "documentos estructurados"} por analizar.`
                : preview.status === "incomplete" ? `${preview.documents.filter(d => d.status === "pending").length} documentos pendientes. Puedes continuar donde se quedó.`
                : preview.status === "schema_failed" ? "El esquema propuesto no superó la validación; se volverá a proponer."
                : `${verified} de ${preview.documents.length} documentos verificados sin incidencias.`}
            </p>
            <div className="flex gap-2">
              {preview.status === "needs_review" || preview.status === "ready" ? (
                <button
                  type="button"
                  onClick={() => { if (window.confirm("Se descartará el esquema y todos los documentos analizados. ¿Volver a empezar?")) void run("restart"); }}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Volver a analizar todo
                </button>
              ) : (
                <button type="button" onClick={() => { stoppedRef.current = false; void run("continue"); }} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">
                  <Database className="size-3" />
                  {preview.status === "idle" ? "Reanudar análisis automático" : preview.status === "schema_failed" ? "Reintentar esquema" : "Reanudar pendientes y fallidos"}
                </button>
              )}
            </div>
          </div>
        )}
        {error ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">{error}</p> : null}
      </div>

      {preview.schemaError || preview.schemaIssues.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-[11px] font-semibold text-rose-800">El esquema propuesto no se ha aceptado</p>
          {preview.schemaError ? <p className="mt-1 text-[11px] text-rose-700">{preview.schemaError}</p> : null}
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-rose-700">
            {preview.schemaIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}
          </ul>
        </div>
      ) : null}

      {schema ? (
        <section>
          <h5 className="mb-2 text-[11px] font-semibold text-slate-800">1 · Tablas comunes propuestas</h5>
          {preview.discoveryScope?.reason ? <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[10px] text-amber-800">{preview.discoveryScope.reason}</p> : null}
          <div className="grid gap-2 md:grid-cols-2">
            {schema.entities.map(entity => {
              const scopeKey = entity.ownedBy ?? entity.identityScope;
              const owner = scopeKey ? schema.relations.find(relation => relation.key === scopeKey) : null;
              return (
                <article key={entity.key} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[12px] font-semibold text-slate-900">{entity.name}</p>
                    <span className="text-[10px] text-slate-400">{ORIGIN_LABEL[entity.origin]} · {preview.support?.entities[entity.key] ?? 0} registros</span>
                  </div>
                  {entity.description ? <p className="mt-0.5 text-[10px] text-slate-500">{entity.description}</p> : null}
                  <p className="mt-1 text-[10px] text-slate-600">
                    Se identifica por <strong>{entity.identityFields.map(key => entity.fields.find(field => field.key === key)?.name ?? key).join(" + ")}</strong>
                    {owner ? <> dentro de su {entity.ownedBy ? schema.entities.find(item => item.key === owner.fromEntity)?.name ?? owner.fromEntity : owner.name}</> : null}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {entity.fields.map(field => {
                      const count = preview.support?.fields[entity.key + "." + field.key] ?? 0;
                      return (
                        <li key={field.key} title={field.description || undefined}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${count ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-400 line-through"}`}>
                          {field.name} <span className="text-slate-400">· {TYPE_LABEL[field.type] ?? field.type}{field.origin !== "new" ? " · " + ORIGIN_LABEL[field.origin] : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
          {schema.relations.length ? (
            <ul className="mt-2 space-y-1">
              {schema.relations.map(relation => (
                <li key={relation.key} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-600">
                  <span className="font-semibold text-slate-800">{relation.name}</span>: {schema.entities.find(e => e.key === relation.fromEntity)?.name} → {schema.entities.find(e => e.key === relation.toEntity)?.name}
                  {" · "}{CARDINALITY_LABEL[relation.cardinality]}{relation.requiredForTarget ? " · obligatorio" : ""}{relation.roleEvidenceRequired ? " · rol citado en la fuente" : ""}
                  {" · "}{preview.support?.relations[relation.key] ?? 0} vínculos
                </li>
              ))}
            </ul>
          ) : null}
          {unsupported && (unsupported.entities.length || unsupported.fields.length || unsupported.relations.length) ? (
            <p className="mt-2 text-[10px] text-slate-500">
              Sin respaldo en los documentos analizados (tachado; no se propondrán): {[...unsupported.entities, ...unsupported.fields, ...unsupported.relations].join(", ")}.
            </p>
          ) : null}
          {schema.warnings.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] text-slate-500">{schema.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
          ) : null}
          {preview.labelIssues.length ? (
            <ul className="mt-2 space-y-0.5 rounded-lg bg-amber-50 p-2 text-[10px] text-amber-800">{preview.labelIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
          ) : null}
        </section>
      ) : null}

      {schema && preview.clusters.length ? (
        <section>
          <h5 className="mb-2 text-[11px] font-semibold text-slate-800">2 · Registros únicos del lote</h5>
          <div className="space-y-2">
            {topLevel.map(entity => {
              const clusters = preview.clusters.filter(cluster => cluster.entity === entity.key);
              if (!clusters.length) return null;
              return (
                <div key={entity.key} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold text-slate-900">{entity.name} <span className="font-normal text-slate-400">· {clusters.length} únicos</span></p>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {clusters.map(cluster => (
                      <li key={cluster.key} className="py-1.5 text-[10px] text-slate-600">
                        <span className="font-medium text-slate-900">{cluster.label}</span>
                        {Object.entries(cluster.identity).map(([key, value]) => <span key={key} className="ml-2 font-mono text-slate-500">{value}</span>)}
                        {cluster.unresolved ? <span className="ml-2 text-amber-700">sin identidad completa</span> : null}
                        <span className="block text-slate-500">
                          {cluster.occurrences.map(occurrence => occurrence.fileName + (occurrence.roles.length ? ` (${occurrence.roles.join(", ")})` : "")).join(" · ")}
                        </span>
                        {cluster.conflicts.map(conflict => (
                          <span key={conflict.field} className="mt-0.5 block text-amber-800">
                            {entity.fields.find(field => field.key === conflict.field)?.name ?? conflict.field} difiere: {[...new Set(conflict.values.map(item => item.value))].join(" / ")}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h5 className="mb-2 text-[11px] font-semibold text-slate-800">{schema ? "3 · " : ""}Documentos</h5>
        <div className="space-y-2">
          {preview.documents.map(document => (
            <DocumentCard key={document.segmentId} document={document} preview={preview} busy={busy}
              onRetry={() => void run("retry_document", document.segmentId)} />
          ))}
        </div>
      </section>

      {preview.calls.length ? (
        <details className="rounded-xl border border-slate-200 bg-white p-3 text-[10px] text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            Detalles técnicos · {preview.totals.calls} llamadas · {(preview.totals.durationMs / 1000).toFixed(0)} s · {preview.totals.inputTokens.toLocaleString("es-ES")} tokens de entrada · {preview.totals.outputTokens.toLocaleString("es-ES")} de salida
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-max text-left">
              <thead className="text-slate-400"><tr><th className="pr-3">Fase</th><th className="pr-3">Documento</th><th className="pr-3">Duración</th><th className="pr-3">Entrada</th><th className="pr-3">Salida</th><th className="pr-3">Estado</th></tr></thead>
              <tbody>
                {preview.calls.map(call => (
                  <tr key={call.id} className="border-t border-slate-100">
                    <td className="pr-3">{call.stage === "schema" ? "Esquema" : "Extracción"}</td>
                    <td className="pr-3">{call.segmentId ? preview.documents.find(document => document.segmentId === call.segmentId)?.fileName ?? "—" : "lote"}</td>
                    <td className="pr-3">{(call.durationMs / 1000).toFixed(1)} s</td>
                    <td className="pr-3">{call.inputTokens ?? "—"}</td>
                    <td className="pr-3">{call.outputTokens ?? "—"}</td>
                    <td className="pr-3">{call.status === "ok" ? <CheckCircle2 className="inline size-3 text-emerald-600" /> : <span className="text-rose-700"><AlertTriangle className="mr-1 inline size-3" />{call.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
