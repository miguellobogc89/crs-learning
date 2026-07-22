// components/knowledge/intake/knowledge-intake-proposal.tsx

"use client";

import {
  AlertTriangle,
  ArrowRight,
  CopyCheck,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import type {
  KnowledgeIntakeDocumentDecision,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";

type KnowledgeIntakeProposalProps = {
  proposal: KnowledgeIntakeProposal;
  isConfirming?: boolean;
};

function getDecisionAppearance(
  decision: KnowledgeIntakeDocumentDecision,
) {
  switch (decision.decision) {
    case "exact_duplicate":
      return {
        icon: CopyCheck,
        title: "Duplicado exacto",
        className:
          "border-emerald-200 bg-emerald-50/60 text-emerald-700",
      };

    case "possible_duplicate":
      return {
        icon: AlertTriangle,
        title: "Posible duplicado",
        className:
          "border-amber-200 bg-amber-50/60 text-amber-700",
      };

    case "new_version":
      return {
        icon: RefreshCw,
        title: "Nueva versión",
        className:
          "border-blue-200 bg-blue-50/60 text-blue-700",
      };

    case "enrich_existing_article":
      return {
        icon: FilePlus2,
        title: "Enriquecer artículo",
        className:
          "border-cyan-200 bg-cyan-50/60 text-cyan-700",
      };

    case "create_article_in_existing_folder":
      return {
        icon: FilePlus2,
        title: "Crear artículo",
        className:
          "border-violet-200 bg-violet-50/60 text-violet-700",
      };

    case "create_article_in_new_folder":
      return {
        icon: FolderPlus,
        title: "Crear carpeta y artículo",
        className:
          "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-700",
      };
  }
}

function getDestinationText(
  decision: KnowledgeIntakeDocumentDecision,
) {
  if (
    decision.decision ===
      "exact_duplicate" ||
    decision.decision ===
      "possible_duplicate"
  ) {
    return decision.duplicateMatch
      ? decision.duplicateMatch.articleTitle
      : "Sin cambios";
  }

  if (
    decision.decision ===
      "new_version" ||
    decision.decision ===
      "enrich_existing_article"
  ) {
    return decision.destination.articleTitle;
  }

  const folderPath =
    decision.destination.folderPath.join(
      " / ",
    );

  return folderPath
    ? `${folderPath} / ${decision.destination.articleTitle}`
    : decision.destination.articleTitle;
}

function ProposalDecisionCard({
  decision,
}: {
  decision: KnowledgeIntakeDocumentDecision;
}) {
  const appearance =
    getDecisionAppearance(decision);

  const Icon = appearance.icon;

  return (
    <article className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            appearance.className,
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {decision.documentName}
            </p>

            <span
              className={[
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                appearance.className,
              ].join(" ")}
            >
              {appearance.title}
            </span>

            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {Math.round(
                decision.confidence * 100,
              )}
              % confianza
            </span>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {decision.reason}
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface/30 px-3 py-2">
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

            <p className="min-w-0 truncate text-xs font-medium text-foreground">
              {getDestinationText(decision)}
            </p>
          </div>

          {decision.warnings.length > 0 ? (
            <div className="mt-3 space-y-1">
              {decision.warnings.map(
                (warning) => (
                  <div
                    key={warning}
                    className="flex items-start gap-2 text-xs text-amber-700"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function KnowledgeIntakeProposal({
  proposal,
}: KnowledgeIntakeProposalProps) {
  const summary = proposal.summary;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <div className="rounded-xl border border-border bg-surface/20 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700">
              <Sparkles className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                {proposal.title}
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                {proposal.description}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xl font-semibold text-foreground">
                {summary.totalDocuments}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Documentos
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xl font-semibold text-emerald-700">
                {summary.exactDuplicates +
                  summary.possibleDuplicates}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Duplicados
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xl font-semibold text-cyan-700">
                {summary.articleEnrichments +
                  summary.newVersions}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Actualizaciones
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xl font-semibold text-violet-700">
                {summary.newArticlesInExistingFolders +
                  summary.newArticlesInNewFolders}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Artículos nuevos
              </p>
            </div>
          </div>
        </div>

        {proposal.warnings.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Avisos generales
            </div>

            <div className="mt-2 space-y-1">
              {proposal.warnings.map(
                (warning) => (
                  <p
                    key={warning}
                    className="text-xs text-amber-700"
                  >
                    {warning}
                  </p>
                ),
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-3 space-y-2 pb-2">
          {proposal.decisions.map(
            (decision) => (
              <ProposalDecisionCard
                key={decision.documentId}
                decision={decision}
              />
            ),
          )}
        </div>
      </div>

    </div>
  );
}