// components/knowledge/intake/modal/knowledge-intake-completed-step.tsx

"use client";

import {
  Ban,
  CheckCircle2,
  FilePlus2,
  RefreshCw,
} from "lucide-react";

import type { ConfirmKnowledgeIntakeResult } from "@/lib/knowledge/intake/types";

type Props = {
  result: ConfirmKnowledgeIntakeResult;
  onReset: () => void;
  onClose: () => void;
};

function getArticlePath(path?: string[]) {
  if (!path?.length) {
    return "Biblioteca principal";
  }

  return path.join(" / ");
}

export function KnowledgeIntakeCompletedStep({
  result,
}: Props) {
  const hasResults =
    result.createdArticles.length > 0 ||
    result.updatedArticles.length > 0 ||
    result.ignoredDocuments.length > 0;

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
              La documentación se ha incorporado
              correctamente.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-2">
        {hasResults ? (
          <div className="space-y-7">
            {result.createdArticles.length > 0 ? (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <FilePlus2 className="h-4 w-4 text-emerald-600" />

                  <h4 className="text-sm font-semibold text-foreground">
                    Artículos creados
                  </h4>

                  <span className="text-xs text-muted-foreground">
                    {result.createdArticles.length}
                  </span>
                </div>

                <div>
                  {result.createdArticles.map(
                    (article, index) => (
                      <div
                        key={article.id}
                        className={[
                          "flex items-start gap-3 py-3",
                          index !==
                          result.createdArticles
                            .length -
                            1
                            ? "border-b border-border/60"
                            : "",
                        ].join(" ")}
                      >
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {article.title}
                          </p>

{article.path?.length ? (
  <p className="mt-1 truncate text-xs text-muted-foreground">
    {article.path.join(" / ")}
  </p>
) : (
  <p className="mt-1 text-xs text-muted-foreground">
    Biblioteca principal
  </p>
)}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            ) : null}

            {result.updatedArticles.length >
            0 ? (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-sky-600" />

                  <h4 className="text-sm font-semibold text-foreground">
                    Artículos actualizados
                  </h4>

                  <span className="text-xs text-muted-foreground">
                    {
                      result.updatedArticles
                        .length
                    }
                  </span>
                </div>

                <div>
                  {result.updatedArticles.map(
                    (article, index) => (
                      <div
                        key={article.id}
                        className={[
                          "flex items-start gap-3 py-3",
                          index !==
                          result.updatedArticles
                            .length -
                            1
                            ? "border-b border-border/60"
                            : "",
                        ].join(" ")}
                      >
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {article.title}
                          </p>

{article.path?.length ? (
  <p className="mt-1 truncate text-xs text-muted-foreground">
    {article.path.join(" / ")}
  </p>
) : (
  <p className="mt-1 text-xs text-muted-foreground">
    Biblioteca principal
  </p>
)}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            ) : null}

            {result.ignoredDocuments.length >
            0 ? (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Ban className="h-4 w-4 text-muted-foreground" />

                  <h4 className="text-sm font-semibold text-foreground">
                    Documentos omitidos
                  </h4>

                  <span className="text-xs text-muted-foreground">
                    {
                      result.ignoredDocuments
                        .length
                    }
                  </span>
                </div>

                <div>
                  {result.ignoredDocuments.map(
                    (document, index) => (
                      <div
                        key={
                          document.documentId
                        }
                        className={[
                          "flex items-start gap-3 py-3",
                          index !==
                          result.ignoredDocuments
                            .length -
                            1
                            ? "border-b border-border/60"
                            : "",
                        ].join(" ")}
                      >
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {
                              document.documentName
                            }
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {document.reason ===
                            "exact_duplicate"
                              ? "Duplicado exacto. No se ha incorporado."
                              : "Posible duplicado. No se ha incorporado."}
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              No se han producido cambios en la
              biblioteca.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}