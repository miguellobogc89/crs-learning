"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { AppCard } from "@/components/app/layouts/app-card";

type HistoryFile = {
  id: string;
  name: string;
  status: string;
  processingStatus: string;
  error: string | null;
  documents: Array<{
    type: string;
    category: string;
    routing: null | {
      knowledge: true;
      articleCandidate: boolean;
      structuredCandidate: boolean;
      reason: string;
      structuredFields: string[];
      existingArticleId: string | null;
      existingStructureKeys: string[];
    };
  }>;
  articleTitles: string[];
  skippedAsDuplicate: boolean;
  assignedToArticle: boolean | null;
};

type HistoryImport = {
  id: string;
  status: string;
  processingStatus: string;
  name: string | null;
  createdAt: string;
  completedAt: string | null;
  totalFiles: number;
  extractedFiles: number;
  failedFiles: number;
  error: string | null;
  proposalReady: boolean;
  articles: Array<{ title: string; action: string; documentIds: string[] }>;
  files: HistoryFile[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function getImportState(item: HistoryImport) {
  if (item.status === "completed") {
    return { label: "Incorporado a Knowledge", tone: "text-emerald-700", icon: CheckCircle2 };
  }
  if (item.status === "cancelled" || item.processingStatus === "cancelled") {
    return { label: "Cancelado", tone: "text-slate-500", icon: AlertCircle };
  }
  if (item.processingStatus === "error" || item.status === "error") {
    return { label: "Error", tone: "text-rose-700", icon: AlertCircle };
  }
  if (item.status === "proposal_ready") {
    return { label: "Propuesta pendiente", tone: "text-amber-700", icon: Clock3 };
  }
  if (item.status === "text_ready") {
    return { label: "Pendiente de organizar", tone: "text-amber-700", icon: Clock3 };
  }
  if (item.status === "proposal_generating") {
    return { label: "Preparando propuesta", tone: "text-blue-700", icon: Loader2 };
  }
  return { label: "En proceso", tone: "text-blue-700", icon: Loader2 };
}

function getFileState(file: HistoryFile) {
  if (file.skippedAsDuplicate || file.status === "duplicate") {
    return "Duplicado omitido";
  }
  if (file.status === "text_error" || file.processingStatus === "error") {
    return "Error de lectura";
  }
  const assessed = file.documents.length > 0 && file.documents.every(doc => doc.routing !== null);
  const noArticleNeeded = assessed && file.documents.every(doc => !doc.routing?.articleCandidate);
  if (file.assignedToArticle === true) {
    return noArticleNeeded ? "Artículo creado pese a no recomendarlo" : "Asignado a artículo";
  }
  if (file.assignedToArticle === false) {
    return noArticleNeeded ? "Sin artículo (correcto según clasificación)" : "Sin artículo asignado";
  }
  if (file.status === "text_ready") {
    return "Texto extraído";
  }
  return "Pendiente de procesar";
}

export function KnowledgeInfoSidebar() {
  const [items, setItems] = useState<HistoryImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true);
    try {
      const response = await fetch("/api/knowledge/import/history", { cache: "no-store" });
      if (!response.ok) throw new Error("No se ha podido consultar el historial");
      const result: { imports?: HistoryImport[] } = await response.json();
      setItems(Array.isArray(result.imports) ? result.imports : []);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al consultar las subidas");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    // Poll persisted state: an import may continue while its modal is closed.
    const interval = window.setInterval(() => { void refresh(true); }, 12_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const pending = items.filter(item =>
    item.status !== "completed" && item.status !== "cancelled");
  const totalFiles = items.reduce((sum, item) => sum + item.files.length, 0);

  return (
    <AppCard className="flex min-h-0 flex-col gap-0 overflow-hidden p-0">
      <div className="shrink-0 border-b border-slate-100 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="size-4 shrink-0 text-[#0A58FF]" />
            <h2 className="text-sm font-semibold text-slate-900">Historial de subidas</h2>
          </div>
          <button
            type="button"
            onClick={() => { void refresh(); }}
            disabled={refreshing}
            aria-label="Actualizar historial de subidas"
            title="Actualizar historial"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Datos reales · últimas 20 importaciones
        </p>
        {!loading && !error ? (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
            <span><strong className="text-slate-900">{items.length}</strong> subidas</span>
            <span><strong className="text-slate-900">{totalFiles}</strong> archivos</span>
            {pending.length > 0 ? (
              <span className="font-medium text-amber-700">{pending.length} sin finalizar</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="max-h-[calc(100vh-245px)] min-h-0 overflow-y-auto px-3 py-3">
        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Consultando historial…
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {error}
            <button type="button" onClick={() => { void refresh(); }} className="ml-2 underline">
              Reintentar
            </button>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <FolderOpen className="mx-auto size-6 text-slate-300" />
            <p className="mt-3 text-xs font-medium text-slate-700">Todavía no hay subidas</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Cuando importes documentos aparecerán aquí, incluso después de recargar.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          {items.map((item, index) => {
            const state = getImportState(item);
            const StateIcon = state.icon;
            const unassigned = item.files.filter(file =>
              file.assignedToArticle === false && !file.skippedAsDuplicate &&
              (!file.documents.length ||
                file.documents.some(doc => doc.routing === null || doc.routing.articleCandidate)));
            return (
              <details key={item.id} defaultOpen={index === 0}
                className="group rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-slate-800">
                        {item.files.length} {item.files.length === 1 ? "archivo" : "archivos"} · {formatDate(item.createdAt)}
                      </p>
                      <span className={`mt-1 flex items-center gap-1 text-[10px] font-medium ${state.tone}`}>
                        <StateIcon className={`size-3 ${state.icon === Loader2 ? "animate-spin" : ""}`} />
                        {state.label}
                      </span>
                      {item.error ? <p className="mt-1 line-clamp-2 text-[10px] text-rose-600">{item.error}</p> : null}
                      {unassigned.length > 0 ? (
                        <p className="mt-1 text-[10px] font-medium text-amber-700">
                          {unassigned.length} sin artículo asignado
                        </p>
                      ) : null}
                    </div>
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                  </div>
                </summary>

                <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                  <p className="text-[10px] text-slate-500">
                    {item.extractedFiles} textos extraídos
                    {item.failedFiles > 0 ? ` · ${item.failedFiles} errores` : ""}
                    {item.proposalReady ? ` · ${item.articles.length} artículos propuestos` : ""}
                  </p>
                  <div className="space-y-2">
                    {item.files.map(file => (
                      <div key={file.id} className="rounded-lg bg-slate-50 p-2.5">
                        <div className="flex items-start gap-1.5">
                          <FileText className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                          <p className="min-w-0 break-all text-[11px] font-medium text-slate-800">{file.name}</p>
                        </div>
                        <p className={`mt-1 text-[10px] ${getFileState(file).includes("revisar") || getFileState(file).includes("pese") || getFileState(file) === "Sin artículo asignado" ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                          {getFileState(file)}
                        </p>
                        {file.documents.map((document, idx) => {
                          const routing = document.routing;
                          const destination = routing
                            ? routing.articleCandidate && routing.structuredCandidate
                              ? "Híbrido · artículo + JSON"
                              : routing.articleCandidate
                                ? "Candidato a artículo"
                                : routing.structuredCandidate
                                  ? "Candidato a JSON"
                                  : "Solo informativo"
                            : "Sin decisión de destino";
                          return (
                            <div key={idx} className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                              <p className="text-[10px] font-medium text-slate-700">
                                {document.type} · {document.category}
                              </p>
                              <p className="mt-1 text-[10px] font-semibold text-blue-700">
                                Knowledge · {destination}
                              </p>
                              {routing?.reason ? (
                                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                  {routing.reason}
                                </p>
                              ) : null}
                              {routing?.structuredFields.length ? (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Campos: {routing.structuredFields.join(", ")}
                                </p>
                              ) : null}
                              {routing?.existingArticleId ? (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Artículo existente: {routing.existingArticleId.slice(0, 8)}
                                </p>
                              ) : null}
                              {routing?.existingStructureKeys.length ? (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Estructuras: {routing.existingStructureKeys.join(", ")}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                        {file.articleTitles.map((title, idx) => (
                          <p key={idx} className="mt-1 text-[10px] text-slate-600">
                            Artículo: {title}
                          </p>
                        ))}
                        {file.error ? <p className="mt-1 text-[10px] text-rose-600">{file.error}</p> : null}
                      </div>
                    ))}
                  </div>
                  <p className="break-all text-[9px] text-slate-400" title={item.id}>
                    Importación {item.id.slice(0, 8)}
                  </p>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </AppCard>
  );
}
