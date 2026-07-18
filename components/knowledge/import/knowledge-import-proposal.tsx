// components/knowledge/import/knowledge-import-proposal.tsx
"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  Folder,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  KnowledgeImportFolderProposal,
  KnowledgeImportProposal,
  KnowledgeImportWarning,
} from "@/lib/knowledge/import/types";

type Props = {
  proposal: KnowledgeImportProposal;
  isConfirming?: boolean;
  onBack: () => void;
  onConfirm?: () => void | Promise<void>;
};

function getWarningLabel(
  warning: KnowledgeImportWarning,
) {
  if (
    warning.type === "duplicate"
  ) {
    return "Duplicado";
  }

  if (
    warning.type ===
    "possible_duplicate"
  ) {
    return "Posible duplicado";
  }

  if (warning.type === "version") {
    return "Versión";
  }

  if (
    warning.type === "contradiction"
  ) {
    return "Contradicción";
  }

  return "Documento sin asignar";
}

function FolderProposal({
  folder,
  depth = 0,
}: {
  folder: KnowledgeImportFolderProposal;
  depth?: number;
}) {
  return (
    <div
      className={[
        depth > 0
          ? "ml-5 border-l border-border pl-4"
          : "",
      ].join(" ")}
    >
      <div className="rounded-xl border border-border bg-background">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
            <Folder className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              {folder.name}
            </p>

            {folder.description ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {folder.description}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-xs text-muted-foreground">
            {folder.articles.length}{" "}
            {folder.articles.length === 1
              ? "artículo"
              : "artículos"}
          </div>
        </div>

        {folder.articles.length > 0 ? (
          <div className="divide-y divide-border">
            {folder.articles.map(
              (article) => (
                <div
                  key={article.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {article.title}
                    </p>

                    {article.description ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {
                          article.description
                        }
                      </p>
                    ) : null}

                    <p className="mt-2 text-xs text-muted-foreground">
                      {
                        article
                          .documentNames
                          .length
                      }{" "}
                      {article
                        .documentNames
                        .length === 1
                        ? "documento asociado"
                        : "documentos asociados"}
                    </p>
                  </div>

                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>

      {folder.folders.length > 0 ? (
        <div className="mt-3 space-y-3">
          {folder.folders.map(
            (childFolder) => (
              <FolderProposal
                key={childFolder.id}
                folder={childFolder}
                depth={depth + 1}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function KnowledgeImportProposalView({
  proposal,
  isConfirming = false,
  onBack,
  onConfirm,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="border-b border-border px-5 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
              <Sparkles className="h-5 w-5" />
            </div>

            <div>
              <p className="text-base font-semibold text-foreground">
                {proposal.title ||
                  "Propuesta de organización"}
              </p>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {proposal.description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <div className="rounded-lg border border-border px-3 py-2 text-center">
              <p className="text-sm font-semibold text-foreground">
                {
                  proposal.summary
                    .totalDocuments
                }
              </p>
              <p className="text-[11px] text-muted-foreground">
                Documentos
              </p>
            </div>

            <div className="rounded-lg border border-border px-3 py-2 text-center">
              <p className="text-sm font-semibold text-foreground">
                {
                  proposal.summary
                    .totalFolders
                }
              </p>
              <p className="text-[11px] text-muted-foreground">
                Carpetas
              </p>
            </div>

            <div className="rounded-lg border border-border px-3 py-2 text-center">
              <p className="text-sm font-semibold text-foreground">
                {
                  proposal.summary
                    .totalArticles
                }
              </p>
              <p className="text-[11px] text-muted-foreground">
                Artículos
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Estructura propuesta
            </h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Todavía no se ha creado nada
              en Knowledge.
            </p>
          </div>

          <div className="space-y-3">
            {proposal.folders.map(
              (folder) => (
                <FolderProposal
                  key={folder.id}
                  folder={folder}
                />
              ),
            )}

            {proposal.rootArticles.length >
            0 ? (
              <div className="rounded-xl border border-border bg-background">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-medium text-foreground">
                    Artículos sin carpeta
                  </p>
                </div>

                <div className="divide-y divide-border">
                  {proposal.rootArticles.map(
                    (article) => (
                      <div
                        key={article.id}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {
                              article.title
                            }
                          </p>

                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {
                              article.description
                            }
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Avisos de revisión
            </h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Revisa versiones, posibles
              duplicados y contradicciones.
            </p>
          </div>

          {proposal.warnings.length >
          0 ? (
            <div className="space-y-3">
              {proposal.warnings.map(
                (warning) => (
                  <div
                    key={warning.id}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {
                              warning.title
                            }
                          </p>

                          <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:text-amber-300">
                            {getWarningLabel(
                              warning,
                            )}
                          </span>
                        </div>

                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {
                            warning.description
                          }
                        </p>

                        <p className="mt-3 text-xs font-medium text-foreground">
                          Acción sugerida
                        </p>

                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {
                            warning.suggestedAction
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />

                <div>
                  <p className="text-sm font-medium text-foreground">
                    Sin avisos detectados
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    La IA no ha encontrado
                    conflictos evidentes en
                    este lote.
                  </p>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={isConfirming}
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>

        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">
            Podrás editar la propuesta
            antes de crearla.
          </p>

          <Button
            type="button"
            disabled={
              isConfirming || !onConfirm
            }
            onClick={() => {
              void onConfirm?.();
            }}
          >
            {isConfirming
              ? "Creando..."
              : "Confirmar estructura"}
          </Button>
        </div>
      </div>
    </div>
  );
}