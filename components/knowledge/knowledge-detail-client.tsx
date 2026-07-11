// components/knowledge/knowledge-detail-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";

import {
  rebuildKnowledgeAction,
  updateKnowledgeAction,
} from "@/app/actions/knowledge";
import { KnowledgeAnalysisPanel } from "@/components/knowledge/knowledge-analysis-panel";
import { KnowledgeLibraryBreadcrumb } from "@/components/knowledge/content/knowledge-library-breadcrumb";
import { KnowledgePageHeader } from "@/components/knowledge/content/knowledge-page-header";
import { KnowledgeEditorHeader } from "@/components/knowledge/knowledge-editor-header";
import { KnowledgeHeader } from "@/components/knowledge/knowledge-header";
import { KnowledgeFileCard } from "@/components/knowledge/knowledge-item/knowledge-file-card";
import { UploadKnowledgeForm } from "@/components/knowledge/upload-knowledge-form";
import type { LibraryItem } from "@/components/knowledge/sidebar/types";
import { Button } from "@/components/ui/button";

type ActiveTab = "general" | "details" | "documents";

type KnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  status: string;
};

type SourceContribution = {
  knowledgeFileId: string;
  percentage: number;
};

type Knowledge = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  knowledge_type: string;
  status: string;
  content: string;
  knowledge_files: KnowledgeFile[];
  knowledge_analysis: {
    status: string | null;
    model: string | null;
    analysis_json: unknown;
  } | null;
  knowledge_graph: {
    applications: unknown;
    products: unknown;
    regulations: unknown;
    dependencies: unknown;
    related_documents: unknown;
  } | null;
};

type Props = {
  knowledge: Knowledge;
  libraryPath: LibraryItem[];
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getSourceContributions(
  analysisJson: unknown,
): SourceContribution[] {
  if (!isRecord(analysisJson)) {
    return [];
  }

  const value = analysisJson.source_contributions;

  if (!Array.isArray(value)) {
    return [];
  }

  const contributions: SourceContribution[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    let knowledgeFileId = "";

    if (typeof item.knowledge_file_id === "string") {
      knowledgeFileId = item.knowledge_file_id;
    } else if (typeof item.file_id === "string") {
      knowledgeFileId = item.file_id;
    }

    const percentage =
      typeof item.percentage === "number"
        ? item.percentage
        : null;

    if (!knowledgeFileId || percentage === null) {
      continue;
    }

    contributions.push({
      knowledgeFileId,
      percentage,
    });
  }

  return contributions;
}

export function KnowledgeDetailClient({
  knowledge,
  libraryPath,
}: Props) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] =
    useState<ActiveTab>("general");

  const [rebuildError, setRebuildError] =
    useState<string | null>(null);

  const [isRebuilding, startRebuildTransition] =
    useTransition();

  const [title, setTitle] = useState(knowledge.title);

  const [description, setDescription] = useState(
    knowledge.description ?? "",
  );

  const [visibility, setVisibility] = useState(
    knowledge.visibility,
  );

  const [knowledgeType, setKnowledgeType] = useState(
    knowledge.knowledge_type ?? "unknown",
  );

  const articleNeedsRebuild =
    knowledge.status === "stale" ||
    knowledge.knowledge_analysis?.status === "stale";

  const sourceContributions = getSourceContributions(
    knowledge.knowledge_analysis?.analysis_json,
  );

  function getContributionPercentage(
    knowledgeFileId: string,
  ) {
    const contribution = sourceContributions.find(
      (item) =>
        item.knowledgeFileId === knowledgeFileId,
    );

    return contribution?.percentage ?? null;
  }

  function cancelEditing() {
    setTitle(knowledge.title);
    setDescription(knowledge.description ?? "");
    setVisibility(knowledge.visibility);

    setKnowledgeType(
      knowledge.knowledge_type ?? "unknown",
    );

    setEditing(false);
  }

  function handleRebuild() {
    if (!articleNeedsRebuild || isRebuilding) {
      return;
    }

    setRebuildError(null);

    startRebuildTransition(async () => {
      try {
        await rebuildKnowledgeAction(knowledge.id);
        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setRebuildError(caughtError.message);
          return;
        }

        setRebuildError(
          "No se ha podido actualizar el conocimiento",
        );
      }
    });
  }

  const tabs = (
    <div className="flex items-center gap-1">
      <KnowledgeTabButton
        active={activeTab === "general"}
        onClick={() => setActiveTab("general")}
      >
        General
      </KnowledgeTabButton>

      <KnowledgeTabButton
        active={activeTab === "details"}
        onClick={() => setActiveTab("details")}
      >
        Detalles

        <span className="ml-1.5 rounded bg-lesson-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase text-lesson">
          IA
        </span>
      </KnowledgeTabButton>

      <KnowledgeTabButton
        active={activeTab === "documents"}
        onClick={() => setActiveTab("documents")}
      >
        Documentos

        <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {knowledge.knowledge_files.length}
        </span>
      </KnowledgeTabButton>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <KnowledgePageHeader
        breadcrumb={
          <KnowledgeLibraryBreadcrumb
            path={libraryPath}
            includeKnowledgeRoot
          />
        }
        tabs={tabs}
      >
        {editing ? (
          <form action={updateKnowledgeAction}>
            <input
              type="hidden"
              name="id"
              value={knowledge.id}
            />

            <input
              type="hidden"
              name="content"
              value={knowledge.content ?? ""}
            />

            <input
              type="hidden"
              name="title"
              value={title}
            />

            <input
              type="hidden"
              name="description"
              value={description}
            />

            <input
              type="hidden"
              name="visibility"
              value={visibility}
            />

            <input
              type="hidden"
              name="knowledgeType"
              value={knowledgeType}
            />

            <KnowledgeEditorHeader
              title={title}
              description={description}
              visibility={visibility}
              knowledgeType={knowledgeType}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              onVisibilityChange={setVisibility}
              onKnowledgeTypeChange={setKnowledgeType}
              onCancel={cancelEditing}
            />
          </form>
        ) : (
          <KnowledgeHeader
            title={knowledge.title}
            description={knowledge.description}
            knowledgeType={
              knowledge.knowledge_type ?? "unknown"
            }
            visibility={knowledge.visibility}
            onEdit={() => setEditing(true)}
          />
        )}
      </KnowledgePageHeader>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "general" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
              <KnowledgeAnalysisPanel
                mode="general"
                analysisJson={
                  knowledge.knowledge_analysis
                    ?.analysis_json
                }
                status={
                  knowledge.knowledge_analysis?.status
                }
                model={
                  knowledge.knowledge_analysis?.model
                }
                knowledgeType={
                  knowledge.knowledge_type
                }
                graph={knowledge.knowledge_graph}
                files={knowledge.knowledge_files}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "details" ? (
          <div className="h-full">
            <div className="mx-auto h-full max-w-7xl px-6 py-6 lg:px-8">
              <KnowledgeAnalysisPanel
                mode="details"
                analysisJson={
                  knowledge.knowledge_analysis
                    ?.analysis_json
                }
                status={
                  knowledge.knowledge_analysis?.status
                }
                model={
                  knowledge.knowledge_analysis?.model
                }
                knowledgeType={
                  knowledge.knowledge_type
                }
                graph={knowledge.knowledge_graph}
                files={knowledge.knowledge_files}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Documentos fuente
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Evidencias utilizadas para construir y analizar
                      este artículo.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setShowUpload((value) => !value)
                      }
                      disabled={isRebuilding}
                    >
                      {showUpload
                        ? "Ocultar subida"
                        : "Añadir documentos"}
                    </Button>

                    <Button
                      type="button"
                      onClick={handleRebuild}
                      disabled={
                        !articleNeedsRebuild ||
                        isRebuilding
                      }
                    >
                      {isRebuilding ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}

                      {isRebuilding
                        ? "Actualizando..."
                        : "Actualizar conocimiento"}
                    </Button>
                  </div>
                </div>

                {articleNeedsRebuild ? (
                  <div className="mb-6 flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                      <div>
                        <p className="text-sm font-semibold text-amber-950">
                          Los documentos han cambiado
                        </p>

                        <p className="mt-1 text-sm text-amber-800">
                          El artículo todavía no representa la
                          documentación actual. Pulsa “Actualizar
                          conocimiento” cuando termines de añadir o
                          eliminar archivos.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />

                    <p className="text-sm font-medium text-emerald-900">
                      El artículo está sincronizado con sus
                      documentos.
                    </p>
                  </div>
                )}

                {rebuildError ? (
                  <p className="mb-6 text-sm text-red-600">
                    {rebuildError}
                  </p>
                ) : null}

                {showUpload ? (
                  <div className="mb-6 rounded-xl border border-border bg-background p-5">
                    <UploadKnowledgeForm
                      knowledgeId={knowledge.id}
                    />
                  </div>
                ) : null}

                {knowledge.knowledge_files.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {knowledge.knowledge_files.map(
                      (file) => (
                        <KnowledgeFileCard
                          key={file.id}
                          file={file}
                          articleNeedsRebuild={
                            articleNeedsRebuild
                          }
                          contributionPercentage={getContributionPercentage(
                            file.id,
                          )}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-10 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No hay documentos vinculados.
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Añade al menos un documento antes de actualizar
                      el conocimiento.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KnowledgeTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex h-12 items-center px-4 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}

      {active ? (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-lesson" />
      ) : null}
    </button>
  );
}