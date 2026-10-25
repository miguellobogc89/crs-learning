// components/knowledge/import/modal/knowledge-import-proposal-step.tsx

"use client";

import { KnowledgeImportBatchSummary } from "./knowledge-import-batch-summary";
import {
  AlertTriangle,
  FilePlus2,
  FileText,
  FolderPlus,
  RefreshCw,
} from "lucide-react";

import type { KnowledgeImportProposal } from "@/lib/knowledge/import/types";
import type { KnowledgeEnginePreview } from "@/lib/engine/knowledge-engine-import.service";

type Props = {
  proposal: KnowledgeImportProposal;
  isConfirming: boolean;
  error: string | null;
  enginePreview: KnowledgeEnginePreview | null;
  enginePreviewLoading: boolean;
  enginePreviewError: string | null;
  enginePreviewMessage:string;
  onRetryEnginePreview:()=>void;
  onBack: () => void;
  onConfirm: () => void;
};

function getFolderPath(
  proposal: KnowledgeImportProposal,
  folderId: string | null,
) {
  if (!folderId) {
    return "Biblioteca principal";
  }

  const foldersById = new Map(
    proposal.folders.map(
      (folder) => [
        folder.id,
        folder,
      ],
    ),
  );

  const path: string[] = [];
  const visited =
    new Set<string>();

  let currentId:
    | string
    | null = folderId;

  while (
    currentId &&
    !visited.has(currentId)
  ) {
    visited.add(currentId);

    const folder =
      foldersById.get(currentId);

    if (!folder) {
      break;
    }

    path.unshift(folder.name);

    currentId =
      folder.parentFolderId;
  }

  return path.length > 0
    ? path.join(" / ")
    : "Biblioteca principal";
}

function ProposalMetric({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
      <strong className="font-semibold text-slate-900">
        {value}
      </strong>
      {label}
    </span>
  );
}

function DocumentNames({
  names,
}: {
  names: string[];
}) {
  if (names.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <FileText
        className="size-3.5 shrink-0 text-slate-400"
        strokeWidth={2}
      />

      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
        {names.join(", ")}
      </span>

      <span className="shrink-0 text-[10px] text-slate-400">
        {names.length}{" "}
        {names.length === 1
          ? "documento"
          : "documentos"}
      </span>
    </div>
  );
}

export function KnowledgeImportProposalStep({
  proposal,
  error,
  enginePreview,
  enginePreviewLoading,
  enginePreviewError,
  enginePreviewMessage,
  onRetryEnginePreview,
}: Props) {
  const createdArticles =
    proposal.articles.filter(
      (article) =>
        article.action === "create",
    );

  const updatedArticles =
    proposal.articles.filter(
      (article) =>
        article.action === "update",
    );

  const linkedIds = new Set(proposal.articles.flatMap(a => a.documentIds));
  const referenceDocuments = Object.entries(proposal.documentRoutes ?? {})
    .filter(([id, route]) => !route.articleCandidate && !linkedIds.has(id));
  const fileNames = new Map((proposal.globalImportMap?.files ?? [])
    .map(file => [file.fileId, file.fileName] as const));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="mb-4 shrink-0 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="shrink-0">
        <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-950">
          {proposal.title}
        </h3>

        <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-slate-500">
          {proposal.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <ProposalMetric
            value={
              proposal.summary
                .totalDocuments
            }
            label={
              proposal.summary
                .totalDocuments === 1
                ? "documento"
                : "documentos"
            }
          />

          <ProposalMetric
            value={
              proposal.summary
                .totalFolders
            }
            label={
              proposal.summary
                .totalFolders === 1
                ? "carpeta"
                : "carpetas"
            }
          />

          <ProposalMetric
            value={
              updatedArticles.length
            }
            label={
              updatedArticles.length ===
              1
                ? "actualización"
                : "actualizaciones"
            }
          />

          <ProposalMetric
            value={
              createdArticles.length
            }
            label={
              createdArticles.length ===
              1
                ? "nuevo"
                : "nuevos"
            }
          />
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        <KnowledgeImportBatchSummary inventory={proposal.globalImportMap} />
        <section className="rounded-xl border border-blue-100 bg-blue-50/30 px-4 py-4">
          <h4 className="text-[12px] font-semibold text-slate-900">
            Engine · Plan de registros
          </h4>
          {enginePreviewLoading ? (
            <p role="status" className="mt-2 text-xs text-blue-700">
              {enginePreviewMessage || "Preparando tablas, registros y relaciones del lote"}. Todavía no se ha escrito ningún registro.
            </p>
          ) : enginePreviewError ? (
            <div className="mt-2 space-y-2">
              <p role="alert" className="text-xs text-rose-700">{enginePreviewError}</p>
              <button type="button" onClick={onRetryEnginePreview} className="rounded-md border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700">Reintentar Engine</button>
              <p className="text-xs text-slate-500">Continúa con los documentos ya verificados, sin volver a subir los archivos.</p>
            </div>
          ) : enginePreview?.status === "ready" ? (
            <div className="mt-3 space-y-3 text-xs">
              <p>{enginePreview.recordsToInsert} nuevos · {enginePreview.recordsToUpdate} por completar · {enginePreview.recordsToReuse} sin cambios.</p>
              <p className="text-slate-600">Al confirmar se aprobarán las tablas y relaciones siguientes. Sus definiciones serán reutilizables; los registros serán privados de este workspace.</p>
              {enginePreview.tables.map(table => (
                <div key={table.key} className="rounded-lg border bg-white p-3">
                  <p className="font-semibold">{table.name} · {table.records} registros</p>
                  <p className="mt-1 text-slate-500">{table.fields.join(" · ")}</p>
                </div>
              ))}
              {enginePreview.relations.map(relation => (
                <p key={relation.key}>{relation.fromEntity} → {relation.toEntity} · {relation.key} · {relation.links} vínculos</p>
              ))}
              {enginePreview.warnings.map((warning,index) => <p key={index} className="text-amber-700">{warning}</p>)}
              {enginePreview.records.map(record => (
                <details key={record.id} className="rounded-lg border bg-white p-3">
                  <summary className="cursor-pointer font-medium">{record.entity} · {record.fileName} · {record.action === "insert" ? "Nuevo" : record.action === "update" ? "Completar" : "Reutilizar"}</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(record.values,null,2)}</pre>
                  {record.conflictingFields.map(field => <p key={field.field} className="mt-1 text-amber-700">{field.field}: guardado {String(field.current)} · extraído {String(field.extracted)}. Se conserva el valor guardado.</p>)}
                </details>
              ))}
            </div>
          ) : enginePreview ? <p className="mt-2 text-xs text-slate-500">No hay documentos destinados a Engine.</p> : null}

        </section>
        {referenceDocuments.length > 0 ? (
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <FileText className="size-4 text-blue-600" />
              <h4 className="text-[12px] font-semibold text-slate-900">Documentos informativos</h4>
              <span className="text-[11px] text-slate-400">{referenceDocuments.length}</span>
            </div>
            <div className="space-y-2">
              {referenceDocuments.map(([id, route]) => (
                <div key={id} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
                  <p className="break-words text-[12px] font-semibold text-slate-900">
                    {fileNames.get(id) ?? id}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-blue-700">
                    {route.structuredCandidate ? "Knowledge · Fuente para Engine" : "Knowledge · Solo consulta"}
                  </p>
                  {route.reason ? (
                    <p className="mt-2 text-[11px] leading-5 text-slate-600">{route.reason}</p>
                  ) : null}
                  {route.structuredFields.length > 0 ? (
                    <p className="mt-1 text-[10px] text-slate-500">Campos posibles: {route.structuredFields.join(", ")}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {proposal.folders.length >
        0 ? (
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <FolderPlus className="size-4 text-[#0A58FF]" />

              <h4 className="text-[12px] font-semibold text-slate-900">
                Carpetas propuestas
              </h4>

              <span className="text-[11px] text-slate-400">
                {
                  proposal.folders
                    .length
                }
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {proposal.folders.map(
                (folder) => (
                  <div
                    key={folder.id}
                    className="border-b border-slate-100 px-4 py-3.5 last:border-b-0"
                  >
                    <p className="text-[13px] font-medium text-slate-950">
                      {folder.name}
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {folder.description ||
                        "Nueva carpeta de conocimiento"}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {updatedArticles.length >
        0 ? (
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <RefreshCw className="size-4 text-[#0A58FF]" />

              <h4 className="text-[12px] font-semibold text-slate-900">
                Artículos que se actualizarán
              </h4>

              <span className="text-[11px] text-slate-400">
                {
                  updatedArticles.length
                }
              </span>
            </div>

            <div className="space-y-2">
              {updatedArticles.map(
                (article) => (
                  <div
                    key={article.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-950">
                          {
                            article.title
                          }
                        </p>

                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-slate-400">
                          Artículo existente
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[13px] font-semibold text-[#0A58FF]">
                          {Math.round(
                            article.confidence *
                              100,
                          )}
                          %
                        </span>

                        <p className="mt-0.5 text-[9px] text-slate-400">
                          coincidencia
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-slate-500">
                      {
                        article.description
                      }
                    </p>

                    <DocumentNames
                      names={
                        article.documentNames
                      }
                    />
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {createdArticles.length >
        0 ? (
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <FilePlus2 className="size-4 text-emerald-600" />

              <h4 className="text-[12px] font-semibold text-slate-900">
                Artículos nuevos
              </h4>

              <span className="text-[11px] text-slate-400">
                {
                  createdArticles.length
                }
              </span>
            </div>

            <div className="space-y-2">
              {createdArticles.map(
                (article) => (
                  <div
                    key={article.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-950">
                          {
                            article.title
                          }
                        </p>

                        <p className="mt-0.5 truncate text-[10px] text-slate-400">
                          {getFolderPath(
                            proposal,
                            article.folderId,
                          )}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[13px] font-semibold text-emerald-600">
                          {Math.round(
                            article.confidence *
                              100,
                          )}
                          %
                        </span>

                        <p className="mt-0.5 text-[9px] text-slate-400">
                          confianza
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-slate-500">
                      {
                        article.description
                      }
                    </p>

                    <DocumentNames
                      names={
                        article.documentNames
                      }
                    />
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {proposal.warnings.length >
        0 ? (
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />

              <h4 className="text-[12px] font-semibold text-slate-900">
                Avisos
              </h4>

              <span className="text-[11px] text-slate-400">
                {
                  proposal.warnings
                    .length
                }
              </span>
            </div>

            <div className="space-y-2">
              {proposal.warnings.map(
                (warning) => (
                  <div
                    key={warning.id}
                    className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3.5"
                  >
                    <p className="text-[12px] font-semibold text-amber-900">
                      {
                        warning.title
                      }
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-amber-700">
                      {
                        warning.description
                      }
                    </p>

                    <p className="mt-2 text-[10px] font-medium text-amber-800">
                      {
                        warning.suggestedAction
                      }
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