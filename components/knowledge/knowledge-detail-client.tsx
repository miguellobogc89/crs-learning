// components/knowledge/knowledge-detail-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";

import {
  rebuildKnowledgeAction,
  updateKnowledgeAction,
} from "@/app/actions/knowledge";
import { KnowledgeAnalysisPanel } from "@/components/knowledge/knowledge-analysis-panel";
import { KnowledgeHeader } from "@/components/knowledge/knowledge-header";
import { KnowledgeFileCard } from "@/components/knowledge/knowledge-item/knowledge-file-card";
import { UploadKnowledgeForm } from "@/components/knowledge/upload-knowledge-form";
import { Button } from "@/components/ui/button";
import { ShareLibraryDialog } from "@/components/knowledge/share-library-dialog";

type ActiveTab = "general" | "details" | "documents";

type LibraryPathItem = {
  id: string;
  name: string;
};

type KnowledgeTeam = {
  id: string;
  name: string;
};

type LibraryShare = {
  id: string;
  team_id: string;
  access_level: string;
  knowledge_teams: {
    id: string;
    name: string;
    knowledge_team_members: {
      id: string;
    }[];
  };
};

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
    updated_at: Date | string;
  library_id: string | null;

  users_knowledge_sources_updated_by_user_idTousers: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
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
  teams,
  libraryShares,
}: {
  knowledge: Knowledge;
  libraryPath: LibraryPathItem[];
  teams: KnowledgeTeam[];
  libraryShares: LibraryShare[];
}) {
  const router = useRouter();

  const uploadFormId = "knowledge-document-upload-form";

  const [isEditingTitle, setIsEditingTitle] =
  useState(false);

const [isEditingDescription, setIsEditingDescription] =
  useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] =
  useState(false);
  const [uploadableFileCount, setUploadableFileCount] =
    useState(0);

  const [activeTab, setActiveTab] =
    useState<ActiveTab>("general");

  const [rebuildError, setRebuildError] =
    useState<string | null>(null);

  const [isRebuilding, startRebuildTransition] =
    useTransition();
  const [isUpdatingHeader, startHeaderTransition] =
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

  const hasDocuments = knowledge.knowledge_files.length > 0;

const hasAnalysis =
  knowledge.knowledge_analysis?.analysis_json !== null &&
  knowledge.knowledge_analysis?.analysis_json !== undefined;

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

  function cancelTitleEditing() {
  setTitle(knowledge.title);
  setIsEditingTitle(false);
}

function saveTitle() {
  const normalizedTitle = title.trim();

  if (
    !normalizedTitle ||
    isUpdatingHeader
  ) {
    return;
  }

  startHeaderTransition(async () => {
    try {
      const formData = new FormData();

      formData.set("id", knowledge.id);
      formData.set("title", normalizedTitle);
      formData.set("description", description);
      formData.set("visibility", visibility);
      formData.set("knowledgeType", knowledgeType);
      formData.set("content", knowledge.content ?? "");

      await updateKnowledgeAction(formData);

      setTitle(normalizedTitle);
      setIsEditingTitle(false);

      router.refresh();
    } catch (error) {
      console.error(error);
      setTitle(knowledge.title);
    }
  });
}

function cancelDescriptionEditing() {
  setDescription(knowledge.description ?? "");
  setIsEditingDescription(false);
}

function saveDescription() {
  if (isUpdatingHeader) {
    return;
  }

  const normalizedDescription = description.trim();

  startHeaderTransition(async () => {
    try {
      const formData = new FormData();

      formData.set("id", knowledge.id);
      formData.set("title", title.trim());
      formData.set("description", normalizedDescription);
      formData.set("visibility", visibility);
      formData.set("knowledgeType", knowledgeType);
      formData.set("content", knowledge.content ?? "");

      await updateKnowledgeAction(formData);

      setDescription(normalizedDescription);
      setIsEditingDescription(false);

      router.refresh();
    } catch (error) {
      console.error(error);
      setDescription(knowledge.description ?? "");
    }
  });
}

  function handleVisibilityChange(
  nextVisibility: string,
) {
  if (
    nextVisibility === visibility ||
    isUpdatingHeader
  ) {
    return;
  }

  const previousVisibility = visibility;

  setVisibility(nextVisibility);

  startHeaderTransition(async () => {
    try {
      const formData = new FormData();

      formData.set("id", knowledge.id);
      formData.set("title", title);
      formData.set("description", description);
      formData.set("visibility", nextVisibility);
      formData.set("knowledgeType", knowledgeType);
      formData.set("content", knowledge.content ?? "");

      await updateKnowledgeAction(formData);
      router.refresh();
    } catch (error) {
      console.error(error);
      setVisibility(previousVisibility);
    }
  });
}

function handleShare() {
  if (!knowledge.library_id) {
    return;
  }

  setIsShareDialogOpen(true);
}

  function closeUpload() {
    setShowUpload(false);
    setUploadableFileCount(0);
  }

  function handleRebuild() {
    if (!hasDocuments || isRebuilding) {
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
<div className="shrink-0 border-b border-border bg-background">
  <div className="mx-auto max-w-7xl px-6 pt-4 lg:px-8">
<KnowledgeHeader
  title={title}
  knowledgeType={knowledgeType}
  visibility={visibility}
  libraryPath={libraryPath}
  updatedAt={knowledge.updated_at}
  updatedBy={
    knowledge.users_knowledge_sources_updated_by_user_idTousers
  }
  sharedTeamCount={libraryShares.length}
  isEditingTitle={isEditingTitle}
  isUpdating={isUpdatingHeader}
  onTitleChange={setTitle}
  onEditTitle={() => setIsEditingTitle(true)}
  onSaveTitle={saveTitle}
  onCancelTitle={cancelTitleEditing}
  onVisibilityChange={handleVisibilityChange}
  onShare={handleShare}
/>

          <div className="mt-2 flex items-center gap-1">
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
{activeTab === "general" ? (
  <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
      {!hasDocuments ? (
        <KnowledgeEmptyState
          icon={<Upload className="h-5 w-5" />}
          title="Añade documentación para construir el artículo"
          description="Sube uno o varios documentos para que la IA pueda analizar su contenido, generar el resumen y extraer la estructura de conocimiento."
          actionLabel="Añadir documentación"
          actionIcon={<Upload className="mr-2 h-4 w-4" />}
          onAction={() => {
            setActiveTab("documents");
            setShowUpload(true);
          }}
        />
      ) : !hasAnalysis ? (
        <KnowledgeEmptyState
          icon={<BrainCircuit className="h-5 w-5" />}
          title="Todavía no hay un análisis disponible"
          description="Procesa la documentación del artículo para generar su resumen de calidad y trazabilidad."
          actionLabel={
            isRebuilding
              ? "Actualizando..."
              : "Actualizar conocimiento"
          }
          actionIcon={
            isRebuilding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )
          }
          onAction={handleRebuild}
          disabled={isRebuilding}
        />
      ) : (
        <KnowledgeAnalysisPanel
          mode="general"
          analysisJson={
            knowledge.knowledge_analysis?.analysis_json
          }
          status={knowledge.knowledge_analysis?.status}
          model={knowledge.knowledge_analysis?.model}
          knowledgeType={knowledge.knowledge_type}
          graph={knowledge.knowledge_graph}
          files={knowledge.knowledge_files}
        />
      )}
    </div>
  </div>
) : null}

{activeTab === "details" ? (
  <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
      {!hasDocuments ? (
        <KnowledgeEmptyState
          icon={<Upload className="h-5 w-5" />}
          title="Añade documentación para generar el análisis"
          description="La IA necesita al menos un documento fuente para identificar conceptos, relaciones, aplicaciones y dependencias."
          actionLabel="Añadir documentación"
          actionIcon={<Upload className="mr-2 h-4 w-4" />}
          onAction={() => {
            setActiveTab("documents");
            setShowUpload(true);
          }}
        />
      ) : !hasAnalysis ? (
        <KnowledgeEmptyState
          icon={<BrainCircuit className="h-5 w-5" />}
          title="Todavía no hay un análisis disponible"
          description="Procesa la documentación del artículo para generar su análisis detallado y extraer la estructura de conocimiento."
          actionLabel={
            isRebuilding
              ? "Actualizando..."
              : "Actualizar conocimiento"
          }
          actionIcon={
            isRebuilding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )
          }
          onAction={handleRebuild}
          disabled={isRebuilding}
        />
      ) : (
        <KnowledgeAnalysisPanel
          mode="details"
          analysisJson={
            knowledge.knowledge_analysis?.analysis_json
          }
          status={knowledge.knowledge_analysis?.status}
          model={knowledge.knowledge_analysis?.model}
          knowledgeType={knowledge.knowledge_type}
          graph={knowledge.knowledge_graph}
          files={knowledge.knowledge_files}
        />
      )}

      {rebuildError ? (
        <p className="mt-4 text-center text-sm text-red-600">
          {rebuildError}
        </p>
      ) : null}
    </div>
  </div>
) : null}

        {activeTab === "documents" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="text-lg font-semibold text-foreground">
                        Documentos fuente
                      </h2>

                      {articleNeedsRebuild ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />

                          <span>
                            Cambios pendientes de actualizar
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />

                          <span>Actualizado</span>
                        </div>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Evidencias utilizadas para construir y
                      analizar este artículo.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {showUpload ? (
                      <>
{uploadableFileCount > 0 ? (
  <div className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 dark:border-cyan-900 dark:bg-cyan-950/20">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
      <FileSearch className="h-3.5 w-3.5" />
    </div>

    <div className="leading-tight">
      <p className="text-xs font-medium text-foreground">
        Documentación preparada
      </p>

      <p className="text-[11px] text-muted-foreground">
        {uploadableFileCount === 1
          ? "1 documento listo para subir."
          : `${uploadableFileCount} documentos listos para subir.`}
      </p>
    </div>
  </div>
) : null}

                        <Button
                          type="button"
                          variant="outline"
                          disabled={isRebuilding}
                          onClick={closeUpload}
                          className="h-11 px-5"
                        >
                          Cancelar
                        </Button>

                        {uploadableFileCount > 0 ? (
                          <Button
                            type="submit"
                            form={uploadFormId}
                            className="h-11 bg-black px-6 text-white hover:bg-black/85"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Subir
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isRebuilding}
                          onClick={() =>
                            setShowUpload(true)
                          }
                          className="h-11 px-5"
                        >
                          Añadir documentos
                        </Button>

                        {articleNeedsRebuild ? (
                          <Button
                            type="button"
                            onClick={handleRebuild}
                            disabled={isRebuilding}
                            className="h-11 bg-black px-5 text-white hover:bg-black/85"
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
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {rebuildError ? (
                  <p className="mb-6 text-sm text-red-600">
                    {rebuildError}
                  </p>
                ) : null}

                {showUpload ? (
                  <div className="mb-6 rounded-xl border border-border bg-background p-5">
                    <UploadKnowledgeForm
                      formId={uploadFormId}
                      knowledgeId={knowledge.id}
                      existingFiles={knowledge.knowledge_files.map(
                        (file) => ({
                          fileName: file.file_name,
                          fileSize: file.file_size,
                        }),
                      )}
                      onUploadableFileCountChange={
                        setUploadableFileCount
                      }
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
                          contributionPercentage={getContributionPercentage(
                            file.id,
                          )}
                        />
                      ),
                    )}
                  </div>
                ) : (
<div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
    <Upload className="h-5 w-5" />
  </div>

  <h3 className="mt-4 text-base font-semibold text-foreground">
    No hay documentos vinculados
  </h3>

  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
    Añade documentación para construir el artículo y
    generar automáticamente su análisis.
  </p>

  {!showUpload ? (
    <Button
      type="button"
      onClick={() => setShowUpload(true)}
      className="mt-6 h-10 bg-black px-5 text-white hover:bg-black/85"
    >
      <Upload className="mr-2 h-4 w-4" />
      Añadir documentos
    </Button>
  ) : null}
</div>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
      <ShareLibraryDialog
  open={isShareDialogOpen}
  libraryId={knowledge.library_id}
  libraryName={
    libraryPath[libraryPath.length - 1]?.name ??
    "Carpeta"
  }
  teams={teams}
  shares={libraryShares}
  onClose={() => setIsShareDialogOpen(false)}
/>
    </div>
  );
}

function KnowledgeEmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
        {icon}
      </div>

      <h2 className="mt-4 text-base font-semibold text-foreground">
        {title}
      </h2>

      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <Button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="mt-6 h-10 bg-black px-5 text-white hover:bg-black/85"
      >
        {actionIcon}
        {actionLabel}
      </Button>
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