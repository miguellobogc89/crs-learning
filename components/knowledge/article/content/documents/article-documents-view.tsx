
// components/knowledge/article/content/documents/article-documents-view.tsx

"use client";

import type {
  KnowledgeAnalysis,
  KnowledgeFile,
} from "@/components/knowledge/detail/knowledge-detail.types";

import {
  getContributionFocusLabel,
  getContributionLabel,
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
    timeStyle: "short",
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
  const { documentContributions } = parseQualityAnalysis(
    analysis?.analysis_json,
  );

  if (documents.length === 0) {
    return (
      <section>
        <h2>Documentos</h2>

        <p>
          Todavía no hay documentos asociados al artículo.
        </p>
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

      {documents.map((document) => {
        const contribution = documentContributions.find(
          (item) =>
            item.sourceId === document.id ||
            item.fileName === document.file_name,
        );

        const fileAnalysis =
          document.knowledge_file_analysis;

        return (
          <details key={document.id}>
            <summary>
              <strong>{document.file_name}</strong>
              {" · "}
              {getFileExtension(document.file_name)}
              {" · "}
              {formatFileSize(document.file_size)}
            </summary>

            <section>
              <h3>Resumen del documento</h3>

              <p>
                {contribution?.summary ||
                  "Este documento todavía no tiene un resumen individual disponible."}
              </p>
            </section>

            {contribution && (
              <section>
                <h3>Función dentro del artículo</h3>

                <dl>
                  <div>
                    <dt>Tipo de documento</dt>
                    <dd>
                      {getDocumentRoleLabel(
                        contribution.documentRole,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Tipo de aportación</dt>
                    <dd>
                      {getContributionLabel(
                        contribution.contributionType,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Contenido aportado</dt>
                    <dd>
                      {getContributionFocusLabel(
                        contribution.contributionFocus,
                      )}
                    </dd>
                  </div>
                </dl>

                {contribution.supportedSections.length > 0 && (
                  <section>
                    <h3>Secciones que respalda</h3>

                    <ul>
                      {contribution.supportedSections.map(
                        (section, index) => (
                          <li key={index}>{section}</li>
                        ),
                      )}
                    </ul>
                  </section>
                )}
              </section>
            )}

            <section>
              <h3>Información del archivo</h3>

              <dl>
                <div>
                  <dt>Formato</dt>
                  <dd>
                    {document.file_type ||
                      getFileExtension(document.file_name)}
                  </dd>
                </div>

                <div>
                  <dt>Tamaño</dt>
                  <dd>
                    {formatFileSize(document.file_size)}
                  </dd>
                </div>

                <div>
                  <dt>Fecha de incorporación</dt>
                  <dd>
                    {formatDate(document.created_at)}
                  </dd>
                </div>

                {document.users?.name && (
                  <div>
                    <dt>Incorporado por</dt>
                    <dd>{document.users.name}</dd>
                  </div>
                )}

                <div>
                  <dt>Estado del archivo</dt>
                  <dd>{document.status}</dd>
                </div>
              </dl>
            </section>

            {fileAnalysis && (
              <section>
                <h3>Análisis del documento</h3>

                <dl>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {getAnalysisStatus(fileAnalysis.status)}
                    </dd>
                  </div>

                  {fileAnalysis.model && (
                    <div>
                      <dt>Modelo</dt>
                      <dd>{fileAnalysis.model}</dd>
                    </div>
                  )}

                  <div>
                    <dt>Último análisis</dt>
                    <dd>
                      {formatDate(fileAnalysis.updated_at)}
                    </dd>
                  </div>

                  {fileAnalysis.error_message && (
                    <div>
                      <dt>Error del análisis</dt>
                      <dd>
                        {fileAnalysis.error_message}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </details>
        );
      })}
    </section>
  );
}