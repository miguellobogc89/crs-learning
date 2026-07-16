// components/knowledge/detail/summary/documents/knowledge-merged-documents-review.tsx

"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  FileText,
  Files,
} from "lucide-react";

import { KnowledgeReviewAccordionItem } from "../review/knowledge-review-accordion-item";
import { KnowledgeReviewBadge } from "../review/knowledge-review-badge";
import { KnowledgeReviewEmptyState } from "../review/knowledge-review-empty-state";
import { KnowledgeReviewSectionHeader } from "../review/knowledge-review-section-header";
import type {
  KnowledgeFile,
  ParsedQualityAnalysis,
} from "../summary.types";
import {
  getContributionFocusLabel,
  getContributionLabel,
  getDocumentRoleLabel,
  getSectionLabel,
} from "../summary.utils";

type Props = {
  files: KnowledgeFile[];
  analysis: ParsedQualityAnalysis;
};

export function KnowledgeMergedDocumentsReview({
  files,
  analysis,
}: Props) {
  const documentRows = useMemo(
    () =>
      files.map((file) => {
        const contribution =
          analysis.documentContributions.find(
            (item) =>
              item.sourceId === file.id ||
              item.fileName === file.file_name,
          );

        return {
          file,
          contribution,
        };
      }),
    [analysis.documentContributions, files],
  );

  if (files.length === 0) {
    return (
      <KnowledgeReviewAccordionItem
        id="knowledge-documents"
        title="Documentos fusionados"
        description="Documentación utilizada para construir este artículo."
        icon={
          <Files className="h-5 w-5 text-blue-600" />
        }
        badge={
          <KnowledgeReviewBadge>
            0 documentos
          </KnowledgeReviewBadge>
        }
      >
        <KnowledgeReviewEmptyState
          icon={<Files className="h-6 w-6" />}
          title="No hay documentación"
          description="Añade documentos para comenzar a construir este artículo."
        />
      </KnowledgeReviewAccordionItem>
    );
  }

  return (
    <KnowledgeReviewAccordionItem
      id="knowledge-documents"
      title="Documentos fusionados"
      description="Todos los documentos utilizados por la IA para construir este artículo."
      icon={
        <Files className="h-5 w-5 text-blue-600" />
      }
      badge={
        <KnowledgeReviewBadge variant="info">
          {files.length} documentos
        </KnowledgeReviewBadge>
      }
    >
      <KnowledgeReviewSectionHeader
        title="Corpus documental"
        description="Consulta qué aporta cada documento al artículo y despliega sus detalles de clasificación."
      />

      <div className="overflow-hidden rounded-xl border border-border">
        {documentRows.map(
          ({ file, contribution }) => (
            <MergedDocumentRow
              key={file.id}
              file={file}
              contribution={contribution}
            />
          ),
        )}
      </div>
    </KnowledgeReviewAccordionItem>
  );
}

type MergedDocumentRowProps = {
  file: KnowledgeFile;
  contribution:
    | ParsedQualityAnalysis["documentContributions"][number]
    | undefined;
};

function MergedDocumentRow({
  file,
  contribution,
}: MergedDocumentRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  const role = getDocumentRoleLabel(
    contribution?.documentRole ?? "reference",
  );

  const contributionLabel =
    getContributionLabel(
      contribution?.contributionType ??
        "reference",
    );

  const focus = getContributionFocusLabel(
    contribution?.contributionFocus ??
      "mixed",
  );

  return (
    <article className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() =>
          setIsOpen((current) => !current)
        }
        className="flex w-full items-start gap-4 px-5 py-5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30"
      >
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
          <FileText className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {file.file_name}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  role,
                  contributionLabel,
                  focus,
                ].join(" · ")}
              </p>
            </div>

            <ChevronDown
              className={[
                "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isOpen ? "rotate-180" : "",
              ].join(" ")}
            />
          </div>

          <p className="mt-3 line-clamp-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            {contribution?.summary ||
              "La IA todavía no ha generado un resumen específico de la aportación de este documento."}
          </p>

          {contribution?.supportedSections
            .length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Aporta conocimiento a{" "}
              <span className="font-medium text-foreground">
                {
                  contribution.supportedSections
                    .length
                }{" "}
                secciones
              </span>
            </p>
          ) : null}
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-border bg-muted/15 px-5 py-5 sm:pl-[76px]">
          <div className="grid gap-5 sm:grid-cols-3">
            <DocumentMeta
              label="Rol documental"
              value={role}
            />

            <DocumentMeta
              label="Tipo de contribución"
              value={contributionLabel}
            />

            <DocumentMeta
              label="Foco"
              value={focus}
            />
          </div>

          {contribution?.supportedSections
            .length ? (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Secciones soportadas
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
{contribution.supportedSections.map(
  (section) => (
    <span
      key={section}
      className="rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-border"
    >
      {getSectionLabel(section)}
    </span>
  ),
)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

type DocumentMetaProps = {
  label: string;
  value: string;
};

function DocumentMeta({
  label,
  value,
}: DocumentMetaProps) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}