// components/knowledge/detail/knowledge-content-editor-section.tsx

"use client";

import {
  Check,
  Download,
  Edit3,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KnowledgeEditor } from "@/components/knowledge/editor/knowledge-editor";
import { Button } from "@/components/ui/button";

import { useKnowledgeContentEditor } from "./hooks/use-knowledge-content-editor";

import type { Knowledge } from "./knowledge-detail.types";

type KnowledgeContentEditorSectionProps = {
  knowledge: Knowledge;
};

export function KnowledgeContentEditorSection({
  knowledge,
}: KnowledgeContentEditorSectionProps) {
  const router = useRouter();

  const [isRebuilding, setIsRebuilding] =
    useState(false);

  const [rebuildError, setRebuildError] =
    useState<string | null>(null);

  const {
    content,
    setContent,
    isEditing,
    isSaving,
    hasChanges,
    saveError,
    startEditing,
    cancelEditing,
    saveContent,
  } = useKnowledgeContentEditor({
    knowledge,
  });

  const hasContent = hasMeaningfulContent(content);

  const hasDocuments =
    knowledge.knowledge_files.length > 0;

  async function downloadPdf() {
    const previousTitle = document.title;
    const title = knowledge.title?.trim();
    const printArea = document.querySelector(
      "[data-knowledge-print-area]",
    );

    if (!printArea) {
      return;
    }

    await waitForPrintableArticle(printArea);

    const printRoot = buildPrintRoot(printArea);

    document.title = title
      ? `${title} - articulo`
      : "articulo";
    document.documentElement.dataset.pdfReady =
      "false";
    document.body
      .querySelectorAll(
        "[data-knowledge-print-root]",
      )
      .forEach((element) => element.remove());
    document.body.append(printRoot);

    document.body.classList.add(
      "printing-knowledge-content",
    );

    const cleanup = () => {
      printRoot.remove();
      document.body.classList.remove(
        "printing-knowledge-content",
      );
      delete document.documentElement.dataset
        .pdfReady;
      document.title = previousTitle;
      window.removeEventListener(
        "afterprint",
        cleanup,
      );
    };

    window.addEventListener(
      "afterprint",
      cleanup,
    );

    await waitForStableLayout();

    document.documentElement.dataset.pdfReady =
      "true";
    window.print();
  }

  async function rebuildArticle() {
    if (isRebuilding || !hasDocuments) {
      return;
    }

    setIsRebuilding(true);
    setRebuildError(null);

    try {
      const response = await fetch(
        `/api/knowledge/articles/${knowledge.id}/rebuild`,
        {
          method: "POST",
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "No se ha podido reconstruir el artículo",
        );
      }

      router.refresh();
    } catch (caughtError) {
      setRebuildError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se ha podido reconstruir el artículo",
      );
    } finally {
      setIsRebuilding(false);
    }
  }

  return (
    <section
      className="space-y-4"
      data-knowledge-print-area
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Contenido
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Información consolidada y editable del
            artículo.
          </p>
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={cancelEditing}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={isSaving || !hasChanges}
              onClick={saveContent}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}

              {isSaving
                ? "Guardando..."
                : "Guardar cambios"}
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2"
            data-knowledge-print-hidden
          >
            <Button
              type="button"
              variant="outline"
              disabled={
                isRebuilding || !hasDocuments
              }
              onClick={rebuildArticle}
            >
              {isRebuilding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}

              {isRebuilding
                ? "Reconstruyendo..."
                : "Reconstruir"}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isRebuilding}
              onClick={startEditing}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              Editar contenido
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!hasContent}
              onClick={downloadPdf}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar PDF
            </Button>
          </div>
        )}
      </div>

      {saveError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {saveError}
        </div>
      ) : null}

      {rebuildError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {rebuildError}
        </div>
      ) : null}

      {isEditing ? (
        <KnowledgeEditor
          value={content}
          onChange={setContent}
          editable
        />
      ) : hasContent ? (
        <KnowledgeEditor
          value={content}
          onChange={() => undefined}
          editable={false}
          className="border-0 bg-transparent"
        />
      ) : (
        <KnowledgeContentEmptyState
          onEdit={startEditing}
        />
      )}
    </section>
  );
}

type KnowledgeContentEmptyStateProps = {
  onEdit: () => void;
};

function KnowledgeContentEmptyState({
  onEdit,
}: KnowledgeContentEmptyStateProps) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <FileText className="h-5 w-5" />
      </div>

      <h3 className="mt-4 text-base font-semibold text-foreground">
        Este artículo todavía no tiene contenido
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Añade texto estructurado, títulos, listas y
        explicaciones para convertirlo en una fuente de
        conocimiento útil.
      </p>

      <Button
        type="button"
        className="mt-5"
        onClick={onEdit}
      >
        <Edit3 className="mr-2 h-4 w-4" />
        Añadir contenido
      </Button>
    </div>
  );
}

function hasMeaningfulContent(content: string) {
  const normalizedContent = content
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

  return normalizedContent.length > 0;
}

async function waitForPrintableArticle(
  printArea: Element,
) {
  await document.fonts.ready;
  await waitForImages(printArea);
  await waitForMermaid(printArea);
  await waitForStableLayout();
}

async function waitForImages(container: Element) {
  const images = Array.from(
    container.querySelectorAll("img"),
  );

  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), {
          once: true,
        });
        image.addEventListener(
          "error",
          () => resolve(),
          {
            once: true,
          },
        );
      });
    }),
  );
}

async function waitForMermaid(container: Element) {
  while (hasPendingMermaid(container)) {
    await nextAnimationFrame();
  }
}

function hasPendingMermaid(container: Element) {
  const blocks = Array.from(
    container.querySelectorAll(
      "[data-knowledge-mermaid-block]",
    ),
  );

  return blocks.some((block) => {
    return (
      block.getAttribute(
        "data-knowledge-mermaid-ready",
      ) !== "true"
    );
  });
}

async function waitForStableLayout() {
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function buildPrintRoot(printArea: Element) {
  const printRoot = document.createElement("div");
  const clonedArea = printArea.cloneNode(
    true,
  ) as HTMLElement;

  printRoot.setAttribute(
    "data-knowledge-print-root",
    "true",
  );

  clonedArea
    .querySelectorAll("[data-knowledge-print-hidden]")
    .forEach((element) => element.remove());

  clonedArea
    .querySelectorAll(
      "[data-knowledge-mermaid-svg] svg",
    )
    .forEach((svg) => {
      svg.removeAttribute("height");
      svg.setAttribute("width", "100%");
      svg.setAttribute(
        "preserveAspectRatio",
        "xMidYMid meet",
      );
    });

  printRoot.append(clonedArea);

  return printRoot;
}
