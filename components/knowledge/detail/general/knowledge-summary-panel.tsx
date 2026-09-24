
﻿// components/knowledge/detail/general/knowledge-summary-panel.tsx

"use client";

import { useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { KnowledgeEditor } from
  "@/components/knowledge/editor/knowledge-editor";

import type { KnowledgeExecutiveSummary } from
  "@/lib/knowledge/knowledge-analysis.types";

type Props = {
  summary: KnowledgeExecutiveSummary;
  isEditing?: boolean;
  savedHtml?: string | null;
  htmlDraft?: string;
  onHtmlDraftChange?: (html: string) => void;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  return escapeHtml(value)
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("");
}

function summaryToHtml(
  summary: KnowledgeExecutiveSummary,
): string {
  const points = summary.keyPoints
    .filter((point) => point.trim().length > 0)
    .map(
      (point) =>
        `<li><p>${escapeHtml(point)}</p></li>`,
    )
    .join("");

  return [
    "<h2>Resumen</h2>",
    textToHtml(summary.synthesis),
    "<h2>Puntos clave</h2>",
    `<ul>${points || "<li><p></p></li>"}</ul>`,
  ].join("");
}

function SavedSummary({
  html,
}: {
  html: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
    ],
    content: html,
    editable: false,
    editorProps: {
      attributes: {
        class: [
          "max-w-4xl outline-none",
          "text-foreground",
          "[&_h2]:mb-4 [&_h2]:mt-10",
          "[&_h2:first-child]:mt-0",
          "[&_h2]:text-2xl [&_h2]:font-semibold",
          "[&_h2]:tracking-tight",
          "[&_h3]:mb-3 [&_h3]:mt-7",
          "[&_h3]:text-xl [&_h3]:font-semibold",
          "[&_p]:my-3 [&_p]:text-base",
          "[&_p]:leading-8",
          "[&_ul]:my-5 [&_ul]:list-disc",
          "[&_ul]:space-y-3 [&_ul]:pl-6",
          "[&_ol]:my-5 [&_ol]:list-decimal",
          "[&_ol]:space-y-3 [&_ol]:pl-6",
          "[&_li]:pl-1",
          "[&_li_p]:my-0",
          "[&_strong]:font-semibold",
          "[&_blockquote]:my-5",
          "[&_blockquote]:border-l-4",
          "[&_blockquote]:border-border",
          "[&_blockquote]:pl-4",
          "[&_blockquote]:italic",
        ].join(" "),
      },
    },
  });

  // El editor de lectura se monta de nuevo cuando
  // cambia el HTML; no admite edición del usuario.
  if (!editor) {
    return null;
  }

  return (
    <div className="w-full min-w-0">
      <EditorContent editor={editor} />
    </div>
  );
}

export function KnowledgeSummaryPanel({
  summary,
  isEditing = false,
  savedHtml,
  htmlDraft,
  onHtmlDraftChange,
}: Props) {
  const generatedHtml = useMemo(
    () => summaryToHtml(summary),
    [summary],
  );

  const synthesis = summary.synthesis.trim();

  const keyPoints = summary.keyPoints
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (isEditing) {
    return (
      <div className="w-full min-w-0">
        <KnowledgeEditor
          value={htmlDraft || savedHtml || generatedHtml}
          onChange={(html) => {
            onHtmlDraftChange?.(html);
          }}
          editable
          className="w-full"
        />
      </div>
    );
  }

  if (savedHtml !== null && savedHtml !== undefined) {
    return (
      <SavedSummary
        key={savedHtml}
        html={savedHtml}
      />
    );
  }

  if (!synthesis && keyPoints.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Todavía no hay un resumen disponible para este artículo.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-12">
      {synthesis ? (
        <section className="space-y-4 border-b border-border pb-12">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Resumen
          </h2>

          <p className="max-w-4xl whitespace-pre-line text-base leading-8 text-foreground/85">
            {synthesis}
          </p>
        </section>
      ) : null}

      {keyPoints.length > 0 ? (
        <section className="space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Puntos clave
          </h2>

          <ul className="max-w-4xl space-y-3">
            {keyPoints.map((point, index) => (
              <li
                key={`${index}-${point}`}
                className="flex items-start gap-3 text-sm leading-7 text-muted-foreground"
              >
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}