// components/knowledge/import/modal/knowledge-import-completed-step.tsx

"use client";

import {
  CheckCircle2,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  SkipForward,
} from "lucide-react";

import type {
  ConfirmKnowledgeImportResult,
} from "@/lib/knowledge/import/types";

type Props = {
  result: ConfirmKnowledgeImportResult;
  onClose: () => void;
};

export function KnowledgeImportCompletedStep({
  result,
}: Props) {
  const { log } = result;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Incorporación completada
            </h3>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              La documentación se ha incorporado a{" "}
              <strong className="font-medium text-foreground">
                {log.targetLibrary.name}
              </strong>
              .
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard
            label="Carpetas"
            value={log.summary.foldersCreated}
            icon={FolderPlus}
          />
          <SummaryCard
            label="Creados"
            value={log.summary.articlesCreated}
            icon={FilePlus2}
          />
          <SummaryCard
            label="Actualizados"
            value={log.summary.articlesUpdated}
            icon={RefreshCw}
          />
          <SummaryCard
            label="Duplicados omitidos"
            value={
              log.summary
                .documentsSkippedAsDuplicates
            }
            icon={SkipForward}
          />
        </div>
      </div>

      <div className="mt-6 min-h-0 flex-1 space-y-7 overflow-y-auto pr-2">
        {log.articles.length > 0 ? (
          <section>
            <h4 className="mb-2 text-sm font-semibold">
              Artículos procesados
            </h4>

            <div className="divide-y divide-border rounded-xl border border-border">
              {log.articles.map(
                (article) => (
                  <div
                    key={`${article.proposalArticleId}:${article.databaseArticleId}`}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {article.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {article.action ===
                          "create"
                            ? "Artículo creado"
                            : article.contentChanged
                              ? "Artículo actualizado"
                              : "Artículo sin cambios"}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs text-muted-foreground">
                        {
                          article
                            .createdDocumentIds
                            .length
                        }{" "}
                        documentos
                      </span>
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {log.skippedDocuments.length >
        0 ? (
          <section>
            <h4 className="mb-2 text-sm font-semibold">
              Documentos duplicados omitidos
            </h4>

            <div className="divide-y divide-amber-200 rounded-xl border border-amber-200 bg-amber-50/60">
              {log.skippedDocuments.map(
                (document) => (
                  <div
                    key={document.importFileId}
                    className="px-4 py-3"
                  >
                    <p className="text-sm font-medium text-amber-900">
                      {document.fileName}
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Ya existía en “
                      {document.articleTitle}”.
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

type SummaryCardProps = {
  label: string;
  value: number;
  icon: typeof FolderPlus;
};

function SummaryCard({
  label,
  value,
  icon: Icon,
}: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <strong className="text-lg">
          {value}
        </strong>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
