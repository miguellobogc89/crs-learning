// app/(app)/knowledge/activity/page.tsx
import Link from "next/link";
import { auth } from "@/auth";
import {
  KnowledgeStatusMap,
  type KnowledgeStatusLibrary,
} from "@/components/knowledge/activity/knowledge-status-map";
import { listKnowledgeStatus } from "@/lib/services/knowledge-library.service";
import { listKnowledgeEvents } from "@/lib/services/knowledge.service";
import { KnowledgeJsonDownload } from "@/components/knowledge/activity/knowledge-json-download";
import {
  Activity,
  ChevronDown,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Map,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";

type ImportFolder = {
  proposalFolderId: string;
  databaseFolderId: string;
  name: string;
  parentProposalFolderId: string | null;
};

type ImportArticle = {
  databaseArticleId: string;
  title: string;
  proposalFolderId: string | null;
  documentIds: string[];
  knowledgeFileIds: string[];
};

type ImportDocument = {
  importFileId: string;
  knowledgeFileId: string;
  fileName: string;
  articleId: string;
  articleTitle: string;
};

type ImportMetadata = {
  targetLibrary?: {
    id: string;
    name: string;
  };
  folders?: ImportFolder[];
  articles?: ImportArticle[];
  documents?: ImportDocument[];
};

type KnowledgeActivityPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

function getEventIcon(action: string) {
  switch (action) {
    case "knowledge.import.completed":
    case "knowledge.article.created":
      return FilePlus2;

    case "knowledge.folder.created":
      return FolderPlus;

    case "knowledge.article.updated":
      return Pencil;

    case "knowledge.article.deleted":
      return Trash2;

    case "knowledge.shared":
      return Share2;

    default:
      return Activity;
  }
}

function parseMetadata(metadata: unknown): ImportMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return metadata as ImportMetadata;
}

function buildFolderPath(
  folder: ImportFolder,
  folders: ImportFolder[],
  rootName: string,
) {
  const path = [folder.name];
  let parentId = folder.parentProposalFolderId;
  const visited = new Set<string>();

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);

    const parent = folders.find(
      (candidate) => candidate.proposalFolderId === parentId,
    );

    if (!parent) {
      break;
    }

    path.unshift(parent.name);
    parentId = parent.parentProposalFolderId;
  }

  return [rootName, ...path].join(" / ");
}

function getArticlePath(
  article: ImportArticle,
  folders: ImportFolder[],
  rootName: string,
) {
  if (!article.proposalFolderId) {
    return `${rootName} / ${article.title}`;
  }

  const folder = folders.find(
    (candidate) =>
      candidate.proposalFolderId === article.proposalFolderId,
  );

  if (!folder) {
    return `${rootName} / ${article.title}`;
  }

  return `${buildFolderPath(folder, folders, rootName)} / ${article.title}`;
}

export default async function KnowledgeActivityPage({
  searchParams,
}: KnowledgeActivityPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const params = await searchParams;
  const activeView = params?.view === "status" ? "status" : "activity";

  const [events, knowledgeStatus] = await Promise.all([
    listKnowledgeEvents(session.user.id),
    listKnowledgeStatus(session.user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl p-8">
      <div className="flex flex-col gap-5 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            Centro de control
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Consulta la actividad y la estructura completa del conocimiento
            visible para ti.
          </p>
        </div>

        <nav className="flex w-fit rounded-lg border border-border bg-muted/40 p-1">
          <Link
            href="/knowledge/activity?view=activity"
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeView === "activity"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Activity className="h-4 w-4" />
            Actividad
          </Link>

          <Link
            href="/knowledge/activity?view=status"
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeView === "status"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Map className="h-4 w-4" />
            Mapa del conocimiento
          </Link>
        </nav>
      </div>

      {activeView === "status" ? (
        <div className="mt-8">
<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div>
    <h2 className="text-xl font-semibold">
      Mapa del conocimiento
    </h2>

    <p className="mt-1 text-sm text-muted-foreground">
      Estructura actual de carpetas, artículos y documentos dentro
      de tu ámbito de visibilidad.
    </p>
  </div>

  <KnowledgeJsonDownload
    data={{
      exportedAt: new Date().toISOString(),
      type: "knowledge-status",
      libraries: knowledgeStatus,
    }}
    fileName={`knowledge-status-${new Date()
      .toISOString()
      .slice(0, 10)}.json`}
    label="Descargar estado"
  />
</div>

          <KnowledgeStatusMap
            libraries={
              knowledgeStatus as unknown as KnowledgeStatusLibrary[]
            }
          />
        </div>
      ) : (
        <div className="mt-8">
<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div>
    <h2 className="text-xl font-semibold">
      Actividad reciente
    </h2>

    <p className="mt-1 text-sm text-muted-foreground">
      Historial de cambios, importaciones y acciones realizadas en
      Knowledge.
    </p>
  </div>

  <KnowledgeJsonDownload
    data={{
      exportedAt: new Date().toISOString(),
      type: "knowledge-activity",
      events,
    }}
    fileName={`knowledge-activity-${new Date()
      .toISOString()
      .slice(0, 10)}.json`}
    label="Descargar actividad"
  />
</div>

          <div className="space-y-3">
            {events.map((event) => {
              const Icon = getEventIcon(event.action);
              const metadata = parseMetadata(event.metadata);

              const folders = metadata?.folders ?? [];
              const articles = metadata?.articles ?? [];
              const documents = metadata?.documents ?? [];
              const rootName =
                metadata?.targetLibrary?.name ?? "Mi biblioteca";

              const hasDetails =
                folders.length > 0 ||
                articles.length > 0 ||
                documents.length > 0;

              return (
                <details
                  key={event.id}
                  className="group rounded-xl border border-border bg-card"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold">
                          {event.users?.name ?? "Usuario"}
                        </span>{" "}
                        {event.title}
                      </p>

                      {event.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      ) : null}
                    </div>

                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString("es-ES")}
                    </span>

                    {hasDetails ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    ) : null}
                  </summary>

                  {hasDetails ? (
                    <div className="border-t border-border px-5 py-5">
                      <div className="grid gap-6 xl:grid-cols-3">
                        <section>
                          <div className="mb-3 flex items-center gap-2">
                            <FolderPlus className="h-4 w-4" />

                            <h3 className="text-sm font-semibold">
                              Carpetas creadas
                            </h3>

                            <span className="text-xs text-muted-foreground">
                              ({folders.length})
                            </span>
                          </div>

                          <div className="space-y-2">
                            {folders.map((folder) => (
                              <div
                                key={folder.databaseFolderId}
                                className="rounded-lg border border-border bg-background p-3"
                              >
                                <div className="flex items-center gap-2">
                                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />

                                  <p className="truncate text-sm font-medium">
                                    {folder.name}
                                  </p>
                                </div>

                                <p className="mt-2 break-words text-xs text-muted-foreground">
                                  {buildFolderPath(
                                    folder,
                                    folders,
                                    rootName,
                                  )}
                                </p>
                              </div>
                            ))}

                            {folders.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No se crearon carpetas.
                              </p>
                            ) : null}
                          </div>
                        </section>

                        <section>
                          <div className="mb-3 flex items-center gap-2">
                            <FilePlus2 className="h-4 w-4" />

                            <h3 className="text-sm font-semibold">
                              Artículos creados
                            </h3>

                            <span className="text-xs text-muted-foreground">
                              ({articles.length})
                            </span>
                          </div>

                          <div className="space-y-2">
                            {articles.map((article) => {
                              const associatedDocuments = documents.filter(
                                (document) =>
                                  document.articleId ===
                                  article.databaseArticleId,
                              );

                              return (
                                <div
                                  key={article.databaseArticleId}
                                  className="rounded-lg border border-border bg-background p-3"
                                >
                                  <p className="text-sm font-medium">
                                    {article.title}
                                  </p>

                                  <p className="mt-2 break-words text-xs text-muted-foreground">
                                    {getArticlePath(
                                      article,
                                      folders,
                                      rootName,
                                    )}
                                  </p>

                                  <div className="mt-3 border-t border-border pt-3">
                                    <p className="text-xs font-medium">
                                      Documentos asociados
                                    </p>

                                    <div className="mt-2 space-y-1">
                                      {associatedDocuments.map(
                                        (document) => (
                                          <div
                                            key={document.knowledgeFileId}
                                            className="flex items-center gap-2 text-xs text-muted-foreground"
                                          >
                                            <FileText className="h-3.5 w-3.5 shrink-0" />

                                            <span className="truncate">
                                              {document.fileName}
                                            </span>
                                          </div>
                                        ),
                                      )}

                                      {associatedDocuments.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                          Sin documentos asociados.
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {articles.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No se crearon artículos.
                              </p>
                            ) : null}
                          </div>
                        </section>

                        <section>
                          <div className="mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4" />

                            <h3 className="text-sm font-semibold">
                              Documentos subidos
                            </h3>

                            <span className="text-xs text-muted-foreground">
                              ({documents.length})
                            </span>
                          </div>

                          <div className="space-y-2">
                            {documents.map((document) => {
                              const article = articles.find(
                                (candidate) =>
                                  candidate.databaseArticleId ===
                                  document.articleId,
                              );

                              return (
                                <div
                                  key={document.knowledgeFileId}
                                  className="rounded-lg border border-border bg-background p-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

                                    <p className="truncate text-sm font-medium">
                                      {document.fileName}
                                    </p>
                                  </div>

                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Asociado a:
                                  </p>

                                  <p className="mt-1 text-xs font-medium">
                                    {document.articleTitle}
                                  </p>

                                  {article ? (
                                    <p className="mt-2 break-words text-xs text-muted-foreground">
                                      {getArticlePath(
                                        article,
                                        folders,
                                        rootName,
                                      )}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}

                            {documents.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No se subieron documentos.
                              </p>
                            ) : null}
                          </div>
                        </section>
                      </div>
                    </div>
                  ) : null}
                </details>
              );
            })}

            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <Activity className="mx-auto h-8 w-8 text-muted-foreground" />

                <p className="mt-3 text-sm font-medium">
                  Todavía no hay actividad
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Las importaciones y cambios aparecerán aquí.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}