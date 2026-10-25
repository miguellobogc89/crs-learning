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
        <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">Destino estructurado</p>
              <h4 className="mt-1 text-[15px] font-semibold text-slate-950">Engine · propuesta relacional</h4>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-600">
                El modelo conjunto se revisa con las fuentes antes de guardar. Al confirmar, las definiciones genéricas se publican en el catálogo compartido; registros, relaciones y evidencias quedan en este workspace.
              </p>
            </div>
            {enginePreview?.status === "ready" ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Listo para revisar</span>
            ) : null}
          </div>
          {enginePreviewLoading ? (
            <p role="status" className="mt-4 rounded-xl border border-blue-100 bg-white/80 p-3 text-xs text-blue-700">
              {enginePreviewMessage || "Preparando tablas, registros y relaciones del lote"}. Todavía no se ha escrito ningún cambio de negocio.
            </p>
          ) : enginePreviewError ? (
            <div className="mt-4 space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p role="alert" className="text-xs text-rose-700">{enginePreviewError}</p>
              <button type="button" onClick={onRetryEnginePreview} className="rounded-md border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-700">Reintentar Engine</button>
              <p className="text-xs text-slate-500">Los originales y documentos ya verificados se conservan; puedes reintentar Engine sin volver a subir ni extraer los archivos.</p>
            </div>
          ) : enginePreview?.status === "ready" ? (
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: enginePreview.recordsToInsert, label: "nuevos" },
                  { value: enginePreview.recordsToUpdate, label: "por completar" },
                  { value: enginePreview.recordsToReuse, label: "reutilizados" },
                ].map(metric => (
                  <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xl font-semibold text-slate-950">{metric.value}</p>
                    <p className="text-[10px] text-slate-500">{metric.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <h5 className="mb-2 text-[11px] font-semibold text-slate-800">Esquema común propuesto</h5>
                <div className="space-y-2">
                  {enginePreview.tables.map(table => (
                    <article key={table.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">{table.name}<span className="ml-2 font-mono text-[10px] font-normal text-slate-400">{table.key}</span></p>
                        <span className="text-[10px] text-slate-500">{table.records} registros de origen</span>
                      </div>
                      {table.description ? <p className="mt-1 text-[11px] text-slate-600">{table.description}</p> : null}
                      <div className="mt-2 divide-y divide-slate-100">
                        {table.fields.map(field => (
                          <div key={field.key} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                            <p className="text-[11px] text-slate-700">
                              <span className="font-medium">{field.name}</span>
                              <span className="ml-1 font-mono text-[9px] text-slate-400">{field.key}</span>
                              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{field.type}{field.required ? " · obligatorio" : ""}</span>
                            </p>
                            {field.evidence.length > 0 ? (
                              <details className="max-w-full text-[10px] text-blue-700">
                                <summary className="cursor-pointer">Ver evidencia ({field.evidence.length})</summary>
                                <div className="mt-1 space-y-1">
                                  {field.evidence.map((item, index) => (
                                    <blockquote key={`${item.documentId}-${index}`} className="rounded bg-blue-50 px-2 py-1 text-slate-600">
                                      <span className="font-medium">{fileNames.get(item.documentId) ?? "Fuente"}:</span> {item.quote}
                                    </blockquote>
                                  ))}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {table.evidence.length > 0 ? (
                        <details className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-blue-700">
                          <summary className="cursor-pointer">Evidencia de la entidad ({table.evidence.length})</summary>
                          {table.evidence.map((item, index) => (
                            <p key={`${item.documentId}-${index}`} className="mt-1 text-slate-600">
                              <span className="font-medium">{fileNames.get(item.documentId) ?? "Fuente"}:</span> {item.quote}
                            </p>
                          ))}
                        </details>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>

              {enginePreview.relations.length > 0 ? (
                <div>
                  <h5 className="mb-2 text-[11px] font-semibold text-slate-800">Relaciones acreditadas por las fuentes</h5>
                  <div className="space-y-2">
                    {enginePreview.relations.map(relation => (
                      <article key={relation.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-semibold text-slate-800">{relation.fromEntity} <span className="text-blue-600">→</span> {relation.toEntity}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{relation.key} · {relation.cardinality.replaceAll("_", " ")} · {relation.links} vínculos · {relation.description}</p>
                        {relation.evidence.map((item, index) => (
                          <p key={`${item.documentId}-${index}`} className="mt-1 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                            <span className="font-medium">{fileNames.get(item.documentId) ?? "Fuente"}:</span> {item.quote}
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {enginePreview.warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <h5 className="text-[11px] font-semibold text-amber-900">Dudas y límites</h5>
                  {enginePreview.warnings.map((warning,index) => <p key={index} className="mt-1 text-[10px] text-amber-800">{warning}</p>)}
                </div>
              ) : null}

              <div>
                <h5 className="mb-2 text-[11px] font-semibold text-slate-800">Registros, conciliación y trazabilidad</h5>
                <div className="space-y-2">
                  {enginePreview.records.map(record => (
                    <details key={record.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <summary className="cursor-pointer text-[11px] font-medium text-slate-800">
                        {record.entity} · {record.fileName} · {record.action === "insert" ? "Nuevo" : record.action === "update" ? "Completar" : "Reutilizar"}
                      </summary>
                      <dl className="mt-2 divide-y divide-slate-100">
                        {Object.entries(record.values).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1.3fr)] gap-3 py-1.5 text-[10px]">
                            <dt className="font-mono text-slate-500">{key}</dt>
                            <dd className="break-words text-slate-800">{String(value)}</dd>
                            {record.evidence[key] ? (
                              <dd className="col-span-2 rounded bg-slate-50 px-2 py-1 text-slate-500">{record.evidence[key]}</dd>
                            ) : null}
                          </div>
                        ))}
                      </dl>
                      {record.conflictingFields.map(field => <p key={field.field} className="mt-1 rounded bg-amber-50 p-2 text-[10px] text-amber-800">{field.field}: guardado {String(field.current)} · extraído {String(field.extracted)}. Se conserva el valor guardado.</p>)}
                    </details>
                  ))}
                </div>
              </div>
            </div>
          ) : enginePreview ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">Este lote no contiene documentos que justifiquen registros estructurados en Engine. Las fuentes y los artículos propuestos se conservan en Knowledge.</p>
          ) : null}

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