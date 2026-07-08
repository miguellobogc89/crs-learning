// components/knowledge/knowledge-detail-client.tsx
"use client";

import { useState } from "react";

import { updateKnowledgeAction, uploadKnowledgeFileAction } from "@/app/actions/knowledge";
import { KnowledgeAnalysisPanel } from "@/components/knowledge/knowledge-analysis-panel";
import { KnowledgeEditorHeader } from "@/components/knowledge/knowledge-editor-header";
import { KnowledgeHeader } from "@/components/knowledge/knowledge-header";
import { KnowledgeFileCard } from "@/components/knowledge/knowledge-item/knowledge-file-card";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { Button } from "@/components/ui/button";

type ActiveTab = "knowledge" | "documents";

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
};

export function KnowledgeDetailClient({ knowledge }: { knowledge: Knowledge }) {
  const [editing, setEditing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("knowledge");

  const [title, setTitle] = useState(knowledge.title);
  const [description, setDescription] = useState(knowledge.description ?? "");
  const [visibility, setVisibility] = useState(knowledge.visibility);
  const [knowledgeType, setKnowledgeType] = useState(
    knowledge.knowledge_type ?? "unknown",
  );

  function cancelEditing() {
    setTitle(knowledge.title);
    setDescription(knowledge.description ?? "");
    setVisibility(knowledge.visibility);
    setKnowledgeType(knowledge.knowledge_type ?? "unknown");
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      {editing ? (
        <form action={updateKnowledgeAction}>
          <input type="hidden" name="id" value={knowledge.id} />
          <input type="hidden" name="content" value={knowledge.content ?? ""} />

          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="description" value={description} />
          <input type="hidden" name="visibility" value={visibility} />
          <input type="hidden" name="knowledgeType" value={knowledgeType} />

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
          knowledgeType={knowledge.knowledge_type ?? "unknown"}
          visibility={knowledge.visibility}
          onEdit={() => setEditing(true)}
        />
      )}

      <div className="mt-8 border-b border-border">
        <div className="flex items-center gap-1">
          <KnowledgeTabButton
            active={activeTab === "knowledge"}
            onClick={() => setActiveTab("knowledge")}
          >
            Knowledge
            <span className="ml-1.5 rounded bg-lesson-soft px-1 text-[9px] font-medium uppercase text-lesson">
              IA
            </span>
          </KnowledgeTabButton>

          <KnowledgeTabButton
            active={activeTab === "documents"}
            onClick={() => setActiveTab("documents")}
          >
            Documents
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              {knowledge.knowledge_files.length}
            </span>
          </KnowledgeTabButton>
        </div>
      </div>

      {activeTab === "knowledge" && (
        <section className="mt-8">
          <KnowledgeAnalysisPanel
            analysisJson={knowledge.knowledge_analysis?.analysis_json}
            status={knowledge.knowledge_analysis?.status}
            model={knowledge.knowledge_analysis?.model}
          />
        </section>
      )}

      {activeTab === "documents" && (
        <section className="mt-8 rounded-lg border border-border bg-panel p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Documents</h2>
              <p className="text-sm text-muted-foreground">
                Documentos fuente utilizados para generar este Knowledge.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowUpload((value) => !value)}
            >
              {showUpload ? "Ocultar subida" : "Añadir documentos"}
            </Button>
          </div>

          {knowledge.knowledge_files.length > 0 && (
            <div className="mb-5 grid gap-3 md:grid-cols-2">
              {knowledge.knowledge_files.map((file) => (
                <KnowledgeFileCard key={file.id} file={file} />
              ))}
            </div>
          )}

          {showUpload && (
            <form action={uploadKnowledgeFileAction}>
              <input type="hidden" name="knowledgeId" value={knowledge.id} />
              <UploadZone accept=".txt,.md,.csv,.docx,.xlsx,.pptx" />
              <div className="mt-4 flex justify-end">
                <Button type="submit">Subir documentos</Button>
              </div>
            </form>
          )}
        </section>
      )}
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
        "relative flex items-center px-3 py-2 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}

      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-lesson" />
      )}
    </button>
  );
}