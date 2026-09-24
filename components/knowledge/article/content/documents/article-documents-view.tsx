
// components/knowledge/article/content/documents/article-documents-view.tsx

"use client";

import { useState } from "react";

import {
  CalendarDays,
  ChevronDown,
  FileText,
  FileSearch,
  UserRound,
} from "lucide-react";

import type {
  KnowledgeAnalysis,
  KnowledgeFile,
} from "@/components/knowledge/detail/knowledge-detail.types";

import {
  getContributionLabel,
  getContributionFocusLabel,
  getDocumentRoleLabel,
  parseQualityAnalysis,
} from "@/components/knowledge/detail/summary/summary.utils";

type ArticleDocumentsViewProps = {
  documents: KnowledgeFile[];
  analysis?: KnowledgeAnalysis | null;
};

function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return "Tamaño desconocido";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: Date | string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha desconocida";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(date);
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop();

  if (!extension || extension === fileName) {
    return "Archivo";
  }

  return extension.toUpperCase();
}

function getAnalysisStatus(status: string): string {
  switch (status) {
    case "ready":
      return "Analizado";
    case "processing":
      return "En análisis";
    case "error":
      return "Error en el análisis";
    default:
      return status;
  }
}

export function ArticleDocumentsView({
  documents,
  analysis,
}: ArticleDocumentsViewProps) {
  const [expandedDocumentId, setExpandedDocumentId] =
    useState<string | null>(null);

  const { documentContributions } = parseQualityAnalysis(
    analysis?.analysis_json,
  );

  if (documents.length === 0) {
    return (
      <section>
        <FileSearch aria-hidden="true" />

        <h2>Documentos</h2>

        <p>Todavía no hay documentos asociados al artículo.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Documentos</h2>

      <p>
        {documents.length}{" "}
        {documents.length === 1
          ? "documento asociado"
          : "documentos asociados"}
      </p>

      <div className="mt-6 divide-y divide-border border-y border-border">
        {documents.map((document) => {
          const expanded =
            expandedDocumentId === document.id;

          const contribution = documentContributions.find(
            (item) =>
              item.sourceId === document.id ||
              item.fileName === document.file_name,
          );

          const fileAnalysis =
            document.knowledge_file_analysis;

          return (
            <article key={document.id}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`document-${document.id}`}
                onClick={() =>
                  setExpandedDocumentId(
                    expanded ? null : document.id,
                  )
                }
                className="flex w-full items-center gap-4 bg-transparent py-5 text-left hover:bg-slate-50"
              >
                <FileText
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-blue-600"
                />

                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">
                    {document.file_name}
                  </span>

                  <span className="mt-1 block text-xs text-slate-500">
                    {getFileExtension(document.file_name)}
                    {" · "}
                    {formatFileSize(document.file_size)}
                    {" · "}
                    {getAnalysisStatus(
                      fileAnalysis?.status ?? document.status,
                    )}
                  </span>
                </span>

                <ChevronDown
                  aria-hidden="true"
                  className={[
                    "h-5 w-5 shrink-0 text-slate-500 transition-transform",
                    expanded ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>

              {expanded && (
                <div
                  id={`document-${document.id}`}
                  className="pb-6 pl-9"
                >
                  {contribution?.summary ? (
                    <div>
                      <h3>Resumen del documento</h3>
                      <p>{contribution.summary}</p>
                    </div>
                  ) : (
                    <p>
                      Este documento todavía no tiene un
                      resumen individual disponible.
                    </p>
                  )}

                  {contribution && (
                    <div className="mt-6">
                      <h3>Función dentro del artículo</h3>

                      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="font-semibold">
                            Tipo de documento
                          </dt>
                          <dd>
                            {getDocumentRoleLabel(
                              contribution.documentRole,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="font-semibold">
                            Tipo de aportación
                          </dt>
                          <dd>
                            {getContributionLabel(
                              contribution.contributionType,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="font-semibold">
                            Contenido aportado
                          </dt>
                          <dd>
                            {getContributionFocusLabel(
                              contribution.contributionFocus,
                            )}
                          </dd>
                        </div>
                      </dl>

                      {contribution.supportedSections.length > 0 && (
                        <div className="mt-5">
                          <h3>Secciones que respalda</h3>

                          <ul>
                            {contribution.supportedSections.map(
                              (section, index) => (
                                <li key={`${section}-${index}`}>
                                  {section}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-6">
                    <h3>Información del archivo</h3>

                    <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold">
                          Formato
                        </dt>
                        <dd>
                          {document.file_type ||
                            getFileExtension(
                              document.file_name,
                            )}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-semibold">
                          Tamaño
                        </dt>
                        <dd>
                          {formatFileSize(
                            document.file_size,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="flex items-center gap-2 font-semibold">
                          <CalendarDays aria-hidden="true" />
                          Incorporado
                        </dt>
                        <dd>
                          {formatDate(document.created_at)}
                        </dd>
                      </div>

                      {document.users?.name && (
                        <div>
                          <dt className="flex items-center gap-2 font-semibold">
                            <UserRound aria-hidden="true" />
                            Incorporado por
                          </dt>
                          <dd>{document.users.name}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {fileAnalysis && (
                    <div className="mt-6">
                      <h3>Análisis del documento</h3>

                      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="font-semibold">
                            Estado
                          </dt>
                          <dd>
                            {getAnalysisStatus(
                              fileAnalysis.status,
                            )}
                          </dd>
                        </div>

                        {fileAnalysis.model && (
                          <div>
                            <dt className="font-semibold">
                              Modelo
                            </dt>
                            <dd>{fileAnalysis.model}</dd>
                          </div>
                        )}

                        {fileAnalysis.updated_at && (
                          <div>
                            <dt className="font-semibold">
                              Último análisis
                            </dt>
                            <dd>
                              {formatDate(
                                fileAnalysis.updated_at,
                              )}
                            </dd>
                          </div>
                        )}

                        {fileAnalysis.error_message && (
                          <div>
                            <dt className="font-semibold">
                              Error
                            </dt>
                            <dd>
                              {fileAnalysis.error_message}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}