// components/knowledge/import/modal/knowledge-import-completed-step.tsx

"use client";

import { useEffect, useState } from "react";

import {
  Check,
  CheckCircle2,
  FileText,
} from "lucide-react";

import type { ConfirmKnowledgeImportResult } from "@/lib/knowledge/import/types";

type Props = {
  result: ConfirmKnowledgeImportResult;
  onClose: () => void;
};

function SummaryMetric({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-4 py-3">
      <strong className="text-[15px] font-semibold tabular-nums text-slate-950">
        {value}
      </strong>

      <span className="truncate text-[11px] text-slate-500">
        {label}
      </span>
    </div>
  );
}

type EngineDiscovery = {
  status: string;
  discoveredEntities?: Array<{ key: string; fields: Array<{ key: string; type: string }> }>;
  discoveredRelations?: Array<{ key: string }>;
  error?: string;
};

function EngineImportActivity({ result }: { result: ConfirmKnowledgeImportResult }) {
  const documents = result.log.documents.filter(document => Boolean(document.knowledgeFileId));
  const [activity, setActivity] = useState<Array<{
    name: string;
    status: "pending" | "analyzing" | "done" | "error";
    entities: number;
    relations: number;
    error?: string;
  }>>(() => documents.map(document => ({
    name: document.fileName, status: "pending", entities: 0, relations: 0,
  })));

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function run() {
      for (const [index, document] of documents.entries()) {
        if (cancelled) return;
        setActivity(previous => previous.map((item, i) =>
          i === index ? { ...item, status: "analyzing" } : item,
        ));
        try {
          const response = await fetch("/api/engine/preview-discovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ knowledgeFileId: document.knowledgeFileId }),
            signal: controller.signal,
          });
          const data = await response.json() as EngineDiscovery;
          if (!response.ok || data.status === "INVALID_PROPOSAL" ||
              data.status === "INVALID_SEMANTIC_REVIEW") {
            throw new Error(data.error ?? "No se ha podido validar la estructura propuesta.");
          }
          if (!cancelled) setActivity(previous => previous.map((item, i) =>
            i === index ? {
              ...item, status: "done",
              entities: data.discoveredEntities?.length ?? 0,
              relations: data.discoveredRelations?.length ?? 0,
            } : item,
          ));
        } catch (error) {
          if (cancelled) return;
          setActivity(previous => previous.map((item, i) =>
            i === index ? {
              ...item, status: "error",
              error: error instanceof Error ? error.message : "Error de análisis",
            } : item,
          ));
        }
      }
    }
    void run();
    return () => { cancelled = true; controller.abort(); };
    // The committed document list is immutable for this completed import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.importId]);

  if (documents.length === 0) return null;
  const finished = activity.filter(item => item.status === "done" || item.status === "error").length;
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[13px] font-semibold text-blue-950">Engine · Análisis de estructuras</h4>
        <span className="text-[11px] tabular-nums text-blue-700">{finished}/{documents.length} archivos</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${documents.length ? finished / documents.length * 100 : 0}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {activity.map((item, index) => (
          <div key={documents[index]?.knowledgeFileId ?? index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs">
            <span className="max-w-[50%] truncate font-medium text-slate-800">{item.name}</span>
            <span className={item.status === "error" ? "text-amber-700" : "text-blue-700"}>
              {item.status === "pending" ? "Pendiente" :
               item.status === "analyzing" ? "Descubriendo entidades y relaciones…" :
               item.status === "error" ? (item.error ?? "Análisis no disponible") :
               `${item.entities} entidades · ${item.relations} relaciones propuestas`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-blue-800">
        Esta fase descubre estructuras y comprueba coincidencias existentes.
        Todavía no crea tipos ni inserta registros en Engine.
      </p>
    </section>
  );
}

export function KnowledgeImportCompletedStep({
  result,
}: Props) {
  const { log } = result;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2
              className="size-5"
              strokeWidth={2.2}
            />
          </div>

          <div className="min-w-0">
            <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-950">
              Incorporación completada
            </h3>

            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              La documentación se ha
              incorporado a{" "}
              <strong className="font-semibold text-slate-800">
                {
                  log.targetLibrary
                    .name
                }
              </strong>
              .
            </p>
          </div>
        </div>

        <div className="mt-5 flex divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <SummaryMetric
            value={
              log.summary
                .foldersCreated
            }
            label="carpetas"
          />

          <SummaryMetric
            value={
              log.summary
                .articlesCreated
            }
            label="nuevos"
          />

          <SummaryMetric
            value={
              log.summary
                .articlesUpdated
            }
            label="actualizados"
          />

          <SummaryMetric
            value={
              log.summary
                .documentsSkippedAsDuplicates
            }
            label="duplicados"
          />
        </div>
      </div>

      <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        <EngineImportActivity result={result} />
        {log.articles.length > 0 ? (
          <section>
            <h4 className="mb-2.5 text-[12px] font-semibold text-slate-900">
              Artículos procesados
            </h4>

            <div className="space-y-2">
              {log.articles.map(
                (article) => (
                  <div
                    key={`${article.proposalArticleId}:${article.databaseArticleId}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0A58FF]">
                      <FileText
                        className="size-4"
                        strokeWidth={2.1}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-950">
                        {
                          article.title
                        }
                      </p>

                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {article.action ===
                        "create"
                          ? "Artículo creado"
                          : article.contentChanged
                            ? "Artículo actualizado"
                            : "Artículo sin cambios"}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500">
                      {
                        article
                          .createdDocumentIds
                          .length
                      }{" "}
                      {article
                        .createdDocumentIds
                        .length === 1
                        ? "documento"
                        : "documentos"}
                    </span>

                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check
                        className="size-3.5"
                        strokeWidth={2.5}
                      />
                    </span>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {log.skippedDocuments.length >
        0 ? (
          <section>
            <h4 className="mb-2.5 text-[12px] font-semibold text-slate-900">
              Documentos duplicados
            </h4>

            <div className="space-y-2">
              {log.skippedDocuments.map(
                (document) => (
                  <div
                    key={
                      document.importFileId
                    }
                    className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3"
                  >
                    <p className="text-[12px] font-medium text-amber-900">
                      {
                        document.fileName
                      }
                    </p>

                    <p className="mt-1 text-[10px] text-amber-700">
                      Ya existía en “
                      {
                        document.articleTitle
                      }
                      ”.
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}