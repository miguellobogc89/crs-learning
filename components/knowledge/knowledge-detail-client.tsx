// components/knowledge/knowledge-detail-client.tsx
"use client";

import { useState } from "react";

import { updateKnowledgeAction } from "@/app/actions/knowledge";
import { KnowledgeAnalysisPanel } from "@/components/knowledge/knowledge-analysis-panel";
import { KnowledgeEditorHeader } from "@/components/knowledge/knowledge-editor-header";
import { KnowledgeHeader } from "@/components/knowledge/knowledge-header";
import { KnowledgeFileCard } from "@/components/knowledge/knowledge-item/knowledge-file-card";
import { UploadKnowledgeForm } from "@/components/knowledge/upload-knowledge-form";
import { Button } from "@/components/ui/button";

type ActiveTab = "general" | "details" | "documents";

type KnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  status: string;
};

type Knowledge = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  knowledge_type: string;
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

export function KnowledgeDetailClient({
  knowledge,
}: {
  knowledge: Knowledge;
}) {
  const [editing, setEditing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] =
    useState<ActiveTab>("general");

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

  function cancelEditing() {
    setTitle(knowledge.title);
    setDescription(knowledge.description ?? "");
    setVisibility(knowledge.visibility);
    setKnowledgeType(
      knowledge.knowledge_type ?? "unknown",
    );
    setEditing(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 pt-8 lg:px-8">
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "general" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
              <KnowledgeAnalysisPanel
                mode="general"
                analysisJson={
                  knowledge.knowledge_analysis?.analysis_json
                }
                status={
                  knowledge.knowledge_analysis?.status
                }
                model={
                  knowledge.knowledge_analysis?.model
                }
                knowledgeType={knowledge.knowledge_type}
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
                  knowledge.knowledge_analysis?.analysis_json
                }
                status={
                  knowledge.knowledge_analysis?.status
                }
                model={
                  knowledge.knowledge_analysis?.model
                }
                knowledgeType={knowledge.knowledge_type}
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
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Documentos fuente
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Evidencias utilizadas para construir y analizar
                      este artículo.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setShowUpload((value) => !value)
                    }
                  >
                    {showUpload
                      ? "Ocultar subida"
                      : "Añadir documentos"}
                  </Button>
                </div>

                {knowledge.knowledge_files.length > 0 ? (
                  <div className="mb-6 grid gap-3 md:grid-cols-2">
                    {knowledge.knowledge_files.map((file) => (
                      <KnowledgeFileCard
                        key={file.id}
                        file={file}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mb-6 rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No hay documentos vinculados.
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Añade documentos para ampliar o volver a
                      generar el artículo.
                    </p>
                  </div>
                )}

                {showUpload ? (
                  <UploadKnowledgeForm
                    knowledgeId={knowledge.id}
                  />
                ) : null}
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