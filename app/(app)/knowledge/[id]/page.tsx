// app/(app)/knowledge/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText, Lock, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import {
  updateKnowledgeAction,
  uploadKnowledgeFileAction,
} from "@/app/actions/knowledge";
import { PageTitle } from "@/components/app/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { findKnowledgeSource } from "@/lib/services/knowledge.service";
import { KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge/file-types";
import { KnowledgeFileCard } from "@/components/knowledge/knowledge-file-card";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { KnowledgeAnalysisPanel } from "@/components/knowledge/knowledge-analysis-panel";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function KnowledgeDetailPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const { id } = await params;
  const knowledge = await findKnowledgeSource(id);

  if (!knowledge) {
    notFound();
  }

  const isOwner = knowledge.owner_user_id === session.user.id;

  if (!isOwner && knowledge.visibility !== "public") {
    notFound();
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background px-6 py-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <PageTitle
          title={knowledge.title}
          subtitle="Edita el contenido base de esta fuente de conocimiento."
        />

        <Button asChild variant="secondary">
          <Link href="/knowledge">
            Volver
          </Link>
        </Button>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <form action={updateKnowledgeAction} className="space-y-6">
              <input type="hidden" name="id" value={knowledge.id} />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Nombre
                </label>

                <Input
                  name="title"
                  defaultValue={knowledge.title}
                  disabled={!isOwner}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Descripción
                </label>

                <Textarea
                  name="description"
                  defaultValue={knowledge.description ?? ""}
                  disabled={!isOwner}
                  className="min-h-24"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Visibilidad
                </label>

                <select
                  name="visibility"
                  defaultValue={knowledge.visibility}
                  disabled={!isOwner}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60"
                >
                  <option value="private">Privado</option>
                  <option value="public">Público</option>
                </select>
              </div>

              <KnowledgeAnalysisPanel
  analysisJson={knowledge.knowledge_analysis?.analysis_json}
  status={knowledge.knowledge_analysis?.status}
  model={knowledge.knowledge_analysis?.model}
/>

              {knowledge.knowledge_files.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Archivos adjuntos
                  </label>

                  <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface/30 p-3">
                    {knowledge.knowledge_files.map((file) => (
                      <KnowledgeFileCard
                        key={file.id}
                        file={file}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Contenido
                </label>

                <Textarea
                  name="content"
                  defaultValue={knowledge.content}
                  disabled={!isOwner}
                  placeholder="Pega aquí documentación, procedimientos, temarios o notas internas."
                  className="min-h-[420px] font-mono text-sm leading-6"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={!isOwner}>
                  Guardar cambios
                </Button>

                <Button asChild type="button" variant="secondary">
                  <Link href="/knowledge">
                    Cancelar
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lesson-soft text-lesson">
                  <FileText className="h-5 w-5" />
                </span>

                <div>
                  <p className="text-sm font-medium text-foreground">
                    Estado
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {knowledge.status}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Visibilidad
                </p>

                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  {knowledge.visibility === "private" && (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}

                  {knowledge.visibility}
                </div>
              </div>

              {!isOwner && (
                <p className="rounded-lg border border-border bg-surface/40 p-3 text-xs text-muted-foreground">
                  Esta fuente es pública, pero no eres el propietario. Solo
                  puedes verla.
                </p>
              )}
            </CardContent>
          </Card>


{isOwner && (
  <Card className="border-border bg-card">
    <CardContent className="space-y-4 p-5">
      <div>
        <p className="text-sm font-medium text-foreground">
          Archivos
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Por ahora admite .txt y .md. El texto se añadirá al contenido base.
        </p>
      </div>

      <form action={uploadKnowledgeFileAction} className="space-y-3">
        <input type="hidden" name="knowledgeId" value={knowledge.id} />

        <UploadZone
          key={knowledge.knowledge_files.length}
          accept={KNOWLEDGE_FILE_ACCEPT}
        />

        <Button type="submit" variant="secondary" className="w-full">
          Subir archivo
        </Button>
      </form>

          </CardContent>
        </Card>
      )}

          <Card className="border-border bg-card">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Acciones IA
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Después usaremos este contenido para generar cursos, tests y
                  preguntas.
                </p>
              </div>

              <Button className="w-full" disabled>
                <Sparkles className="mr-2 h-4 w-4" />
                Generar curso
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}