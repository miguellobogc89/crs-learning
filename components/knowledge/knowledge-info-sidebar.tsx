"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
} from "lucide-react";

import { AppCard } from "@/components/app/layouts/app-card";
import { KnowledgeImportModal } from "@/components/knowledge/import/modal";
import { advanceIntake, PHASE_NAMES } from "@/components/knowledge/import/advance-intake";
import { buildImportLog, logFileName } from "@/components/knowledge/import/modal/import-log";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  pipeline: null | { libraryId: string; siguiente: string | null; etapas: Record<string, string> };
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

/** Status of an import in one short label (pipeline batches: by stage; older imports: as before). */
function importStatus(item: HistoryImport) {
  const p = item.pipeline;
  if (!p) return getImportState(item);
  const stages = Object.values(p.etapas);
  if (p.etapas.escritura === "completed") return { label: "Guardado en tus datos", tone: "text-emerald-700", icon: CheckCircle2 };
  if (stages.includes("error")) return { label: "Con errores", tone: "text-rose-700", icon: AlertCircle };
  if (stages.includes("running")) return { label: "En proceso", tone: "text-blue-700", icon: Loader2 };
  if (!p.siguiente) return { label: "Completado", tone: "text-emerald-700", icon: CheckCircle2 };
  return { label: p.siguiente === "escritura" ? "Listo para guardar" : `Pendiente: ${PHASE_NAMES[p.siguiente] ?? p.siguiente}`, tone: "text-amber-700", icon: Clock3 };
}

function relativeDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return formatDate(value);
}

async function readJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo leer el lote");
  return body;
}

/** Downloads the log of a stored import without opening it (read-only: nothing is started). */
async function downloadLog(id: string) {
  const view = await advanceIntake(id, async (url, method) => {
    if (method) throw new Error("Solo lectura");
    return readJson(url);
  }, { start: false });
  const blob = new Blob([JSON.stringify(buildImportLog(id, [], view), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = logFileName(id);
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KnowledgeInfoSidebar() {
  const [items, setItems] = useState<HistoryImport[]>([]);
  // Import reopened step by step (no new upload): its window resumes at the next pending stage.
  const [opened, setOpened] = useState<{ id: string; libraryId: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    // Poll persisted state: an import may continue while its window is closed.
    const interval = window.setInterval(() => { void refresh(true); }, 12_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(null), 2500); };
  const attention = items.filter(item => { const label = importStatus(item).label; return label.startsWith("Pendiente") || label === "Listo para guardar" || label === "Con errores" || label === "Error"; });
  const totalFiles = items.reduce((sum, item) => sum + item.files.length, 0);

  return (
    <AppCard className="flex min-h-0 flex-col gap-0 overflow-hidden p-0">
      <div className="shrink-0 border-b border-slate-100 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="size-4 shrink-0 text-[#0A58FF]" />
            <h2 className="text-sm font-semibold text-slate-900">Importaciones</h2>
          </div>
          <button type="button" onClick={() => { void refresh(); }} disabled={refreshing}
            aria-label="Actualizar importaciones" title="Actualizar"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          </button>
        </div>
        {!loading && !error ? (
          <p className="mt-1 text-[11px] text-slate-500">
            {items.length} {items.length === 1 ? "importación" : "importaciones"} · {totalFiles} documentos
            {attention.length ? <span className="font-medium text-amber-700"> · {attention.length} requieren atención</span> : null}
          </p>
        ) : null}
        {notice ? <p role="status" className="mt-2 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">{notice}</p> : null}
      </div>

      <div className="max-h-[calc(100vh-245px)] min-h-0 overflow-y-auto px-2 py-2">
        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Cargando importaciones…
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="m-1 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {error}
            <button type="button" onClick={() => { void refresh(); }} className="ml-2 underline">Volver a cargar</button>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <FolderOpen className="mx-auto size-6 text-slate-300" />
            <p className="mt-3 text-xs font-medium text-slate-700">Todavía no hay importaciones</p>
            <p className="mt-1 text-[11px] text-slate-500">Cuando subas documentos aparecerán aquí.</p>
          </div>
        ) : null}

        <ul className="space-y-1">
          {items.map(item => {
            const state = importStatus(item);
            const StateIcon = state.icon;
            const count = item.files.length || item.totalFiles;
            const isOpen = expanded === item.id;
            const open = () => item.pipeline ? setOpened({ id: item.id, libraryId: item.pipeline.libraryId }) : setExpanded(isOpen ? null : item.id);
            return (
              <li key={item.id} className={cn("group rounded-xl transition-colors hover:bg-slate-50", isOpen && "bg-slate-50")}>
                <div className="flex items-start gap-2 px-2.5 py-2.5">
                  <button type="button" onClick={open} className="min-w-0 flex-1 text-left" title={item.pipeline ? "Abrir paso a paso" : "Ver detalles"}>
                    <p className="text-[12px] font-medium text-slate-900">
                      Se {count === 1 ? "subió 1 documento" : `subieron ${count} documentos`}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                      <span>{relativeDate(item.createdAt)}</span>
                      <span aria-hidden>·</span>
                      <span className={cn("inline-flex items-center gap-1 font-medium", state.tone)}>
                        <StateIcon className={cn("size-3", state.icon === Loader2 && "animate-spin")} />{state.label}
                      </span>
                    </p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label="Acciones de la importación"
                      className="rounded-md p-1 text-slate-400 opacity-70 transition hover:bg-white hover:text-slate-700 group-hover:opacity-100 data-[state=open]:opacity-100">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {item.pipeline ? (
                        <DropdownMenuItem onClick={open}>
                          <Play className="size-3.5" />{item.pipeline.siguiente ? `Continuar · ${PHASE_NAMES[item.pipeline.siguiente] ?? item.pipeline.siguiente}` : "Abrir"}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onClick={() => setExpanded(isOpen ? null : item.id)}>
                        <Eye className="size-3.5" />{isOpen ? "Ocultar documentos" : "Ver documentos"}
                      </DropdownMenuItem>
                      {item.pipeline ? (
                        <DropdownMenuItem onClick={() => { void downloadLog(item.id).then(() => flash("Log descargado"), e => flash(e instanceof Error ? e.message : "No se pudo descargar")); }}>
                          <Download className="size-3.5" />Descargar log
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(item.id).then(() => flash("Identificador copiado")); }}>
                        <Copy className="size-3.5" />Copiar identificador
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {isOpen ? (
                  <div className="space-y-1 px-2.5 pb-3">
                    {item.error ? <p className="text-[11px] text-rose-600">{item.error}</p> : null}
                    {item.files.map(file => (
                      <div key={file.id} className="flex items-start gap-1.5 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100">
                        <FileText className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="break-all text-[11px] font-medium text-slate-800">{file.name}</p>
                          {!item.pipeline ? <p className="text-[10px] text-slate-500">{getFileState(file)}</p> : null}
                          {file.error ? <p className="text-[10px] text-rose-600">{file.error}</p> : null}
                        </div>
                      </div>
                    ))}
                    {item.pipeline ? (
                      <p className="pt-1 text-[10px] text-slate-500">
                        {Object.entries(item.pipeline.etapas).map(([k, v]) => `${PHASE_NAMES[k] ?? k}: ${v === "completed" ? "✓" : v === "error" ? "error" : v === "running" ? "en curso" : "—"}`).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {opened ? (
        <KnowledgeImportModal open stepwise resumeImportId={opened.id} context={{ origin: "root", libraryId: opened.libraryId }}
          onOpenChange={(next: boolean) => { if (!next) { setOpened(null); void refresh(); } }} />
      ) : null}
    </AppCard>
  );
}
