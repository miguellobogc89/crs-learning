// components/knowledge/intake/modal/knowledge-import-proposal-step.tsx

"use client";

import {
  AlertTriangle,
  FilePlus2,
  FolderPlus,
  RefreshCw,
} from "lucide-react";

import type {
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";

type Props = {
  proposal: KnowledgeImportProposal;
  isConfirming: boolean;
  error: string | null;
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
    proposal.folders.map((folder) => [
      folder.id,
      folder,
    ]),
  );

  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = folderId;

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

export function KnowledgeImportProposalStep({
  proposal,
  error,
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="shrink-0">
        <h3 className="text-lg font-semibold text-foreground">
          {proposal.title}
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {proposal.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-muted px-3 py-1.5">
            {proposal.summary.totalDocuments} documentos
          </span>
          <span className="rounded-full bg-muted px-3 py-1.5">
            {proposal.summary.totalFolders} carpetas
          </span>
          <span className="rounded-full bg-muted px-3 py-1.5">
            {proposal.summary.totalArticles} artículos
          </span>
          <span className="rounded-full bg-muted px-3 py-1.5">
            {proposal.summary.totalWarnings} avisos
          </span>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-7 overflow-y-auto pr-2">
        {proposal.folders.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-violet-600" />
              <h4 className="text-sm font-semibold">
                Carpetas propuestas
              </h4>
              <span className="text-xs text-muted-foreground">
                {proposal.folders.length}
              </span>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border">
              {proposal.folders.map(
                (folder) => (
                  <div
                    key={folder.id}
                    className="px-4 py-3"
                  >
                    <p className="text-sm font-medium">
                      {folder.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {folder.description ||
                        "Nueva carpeta de conocimiento"}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {createdArticles.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <FilePlus2 className="h-4 w-4 text-emerald-600" />
              <h4 className="text-sm font-semibold">
                Artículos nuevos
              </h4>
              <span className="text-xs text-muted-foreground">
                {createdArticles.length}
              </span>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border">
              {createdArticles.map(
                (article) => (
                  <div
                    key={article.id}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {article.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {getFolderPath(
                            proposal,
                            article.folderId,
                          )}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs font-medium text-emerald-700">
                        {Math.round(
                          article.confidence *
                            100,
                        )}
                        %
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {article.description}
                    </p>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {article.documentNames.join(
                        ", ",
                      )}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {updatedArticles.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-sky-600" />
              <h4 className="text-sm font-semibold">
                Artículos que se actualizarán
              </h4>
              <span className="text-xs text-muted-foreground">
                {updatedArticles.length}
              </span>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border">
              {updatedArticles.map(
                (article) => (
                  <div
                    key={article.id}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {article.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Artículo existente
                        </p>
                      </div>

                      <span className="shrink-0 text-xs font-medium text-sky-700">
                        {Math.round(
                          article.confidence *
                            100,
                        )}
                        %
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {article.description}
                    </p>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {article.documentNames.join(
                        ", ",
                      )}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {proposal.warnings.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h4 className="text-sm font-semibold">
                Avisos
              </h4>
              <span className="text-xs text-muted-foreground">
                {proposal.warnings.length}
              </span>
            </div>

            <div className="divide-y divide-amber-200 rounded-xl border border-amber-200 bg-amber-50/60">
              {proposal.warnings.map(
                (warning) => (
                  <div
                    key={warning.id}
                    className="px-4 py-3"
                  >
                    <p className="text-sm font-medium text-amber-900">
                      {warning.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      {warning.description}
                    </p>
                    <p className="mt-2 text-xs font-medium text-amber-900">
                      {warning.suggestedAction}
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
