// components/knowledge/activity/knowledge-status-map.tsx
import {
  BookOpen,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  Library,
  Network,
} from "lucide-react";

type KnowledgeFile = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  status: string | null;
};

type KnowledgeArticle = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  knowledge_type: string | null;
  visibility: string | null;
  knowledge_files: KnowledgeFile[];
};

export type KnowledgeStatusLibrary = {
  id: string;
  name: string;
  parent_id: string | null;
  owner_user_id: string;
  visibility: string | null;
  position: number | null;
  knowledge_sources: KnowledgeArticle[];
};

type KnowledgeStatusMapProps = {
  libraries: KnowledgeStatusLibrary[];
};

type LibraryTotals = {
  folders: number;
  articles: number;
  documents: number;
};

function formatFileSize(size: number | null) {
  if (!size || size <= 0) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeFileType(fileType: string | null) {
  if (!fileType) {
    return "Archivo";
  }

  const normalized = fileType
    .replace("application/", "")
    .replace("image/", "")
    .replace("text/", "")
    .replace(
      "vnd.openxmlformats-officedocument.wordprocessingml.document",
      "DOCX",
    )
    .replace(
      "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "XLSX",
    )
    .replace(
      "vnd.openxmlformats-officedocument.presentationml.presentation",
      "PPTX",
    );

  return normalized.toUpperCase();
}

function getChildren(
  libraries: KnowledgeStatusLibrary[],
  parentId: string,
) {
  return libraries
    .filter((library) => library.parent_id === parentId)
    .sort((a, b) => {
      const positionA = a.position ?? 0;
      const positionB = b.position ?? 0;

      if (positionA !== positionB) {
        return positionA - positionB;
      }

      return a.name.localeCompare(b.name, "es");
    });
}

function getLibraryTotals(
  libraryId: string,
  libraries: KnowledgeStatusLibrary[],
  visited = new Set<string>(),
): LibraryTotals {
  if (visited.has(libraryId)) {
    return {
      folders: 0,
      articles: 0,
      documents: 0,
    };
  }

  const currentVisited = new Set(visited);
  currentVisited.add(libraryId);

  const library = libraries.find(
    (candidate) => candidate.id === libraryId,
  );

  if (!library) {
    return {
      folders: 0,
      articles: 0,
      documents: 0,
    };
  }

  const children = getChildren(libraries, libraryId);

  const ownDocuments = library.knowledge_sources.reduce(
    (total, article) => total + article.knowledge_files.length,
    0,
  );

  return children.reduce<LibraryTotals>(
    (totals, child) => {
      const childTotals = getLibraryTotals(
        child.id,
        libraries,
        currentVisited,
      );

      return {
        folders: totals.folders + 1 + childTotals.folders,
        articles: totals.articles + childTotals.articles,
        documents: totals.documents + childTotals.documents,
      };
    },
    {
      folders: 0,
      articles: library.knowledge_sources.length,
      documents: ownDocuments,
    },
  );
}

function ArticleNode({
  article,
}: {
  article: KnowledgeArticle;
}) {
  const documents = article.knowledge_files ?? [];

  return (
    <details className="group/article ml-6 border-l border-border pl-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60">
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/article:rotate-180" />

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {article.title}
          </p>

          <p className="text-xs text-muted-foreground">
            {documents.length}{" "}
            {documents.length === 1 ? "documento" : "documentos"}
          </p>
        </div>

        {article.status ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {article.status}
          </span>
        ) : null}

        {article.visibility ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {article.visibility}
          </span>
        ) : null}
      </summary>

      <div className="ml-7 space-y-1 pb-2 pt-1">
        {documents.map((document) => {
          const fileSize = formatFileSize(document.file_size);

          return (
            <div
              key={document.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/40"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {document.file_name}
                </p>

                <p className="text-xs text-muted-foreground">
                  {[
                    normalizeFileType(document.file_type),
                    fileSize,
                    document.status,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          );
        })}

        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            Este artículo no tiene documentos asociados.
          </div>
        ) : null}
      </div>
    </details>
  );
}

function LibraryNode({
  library,
  libraries,
  level,
  visited,
}: {
  library: KnowledgeStatusLibrary;
  libraries: KnowledgeStatusLibrary[];
  level: number;
  visited: Set<string>;
}) {
  if (visited.has(library.id)) {
    return null;
  }

  const currentVisited = new Set(visited);
  currentVisited.add(library.id);

  const children = getChildren(libraries, library.id);
  const articles = [...library.knowledge_sources].sort((a, b) =>
    a.title.localeCompare(b.title, "es"),
  );

  const totals = getLibraryTotals(library.id, libraries);
  const isRoot = library.parent_id === null;

  return (
    <details
      open={isRoot}
      className={
        isRoot
          ? "group/library rounded-xl border border-border bg-card"
          : "group/library ml-6 border-l border-border pl-4"
      }
    >
      <summary
        className={[
          "flex cursor-pointer list-none items-center gap-3 rounded-lg hover:bg-muted/60",
          isRoot ? "p-4" : "px-3 py-2",
        ].join(" ")}
      >
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/library:rotate-180" />

        <div
          className={[
            "flex shrink-0 items-center justify-center rounded-md bg-muted",
            isRoot ? "h-10 w-10" : "h-8 w-8",
          ].join(" ")}
        >
          {isRoot ? (
            <Library className="h-5 w-5 text-muted-foreground" />
          ) : (
            <>
              <Folder className="h-4 w-4 text-muted-foreground group-open/library:hidden" />
              <FolderOpen className="hidden h-4 w-4 text-muted-foreground group-open/library:block" />
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={
              isRoot
                ? "truncate text-base font-semibold"
                : "truncate text-sm font-medium"
            }
          >
            {library.name}
          </p>

          <p className="text-xs text-muted-foreground">
            {totals.folders} carpetas · {totals.articles} artículos ·{" "}
            {totals.documents} documentos
          </p>
        </div>

        {library.visibility ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {library.visibility}
          </span>
        ) : null}
      </summary>

      <div className={isRoot ? "space-y-1 px-4 pb-4" : "space-y-1 pb-2"}>
        {children.map((child) => (
          <LibraryNode
            key={child.id}
            library={child}
            libraries={libraries}
            level={level + 1}
            visited={currentVisited}
          />
        ))}

        {articles.map((article) => (
          <ArticleNode
            key={article.id}
            article={article}
          />
        ))}

        {children.length === 0 && articles.length === 0 ? (
          <div className="ml-6 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Esta carpeta está vacía.
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function KnowledgeStatusMap({
  libraries,
}: KnowledgeStatusMapProps) {
  const totalArticles = libraries.reduce(
    (total, library) => total + library.knowledge_sources.length,
    0,
  );

  const totalDocuments = libraries.reduce(
    (libraryTotal, library) =>
      libraryTotal +
      library.knowledge_sources.reduce(
        (articleTotal, article) =>
          articleTotal + article.knowledge_files.length,
        0,
      ),
    0,
  );

  const rootLibraries = libraries.filter(
    (library) =>
      library.parent_id === null ||
      !libraries.some(
        (candidate) => candidate.id === library.parent_id,
      ),
  );

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Folder className="h-5 w-5 text-muted-foreground" />
            </div>

            <div>
              <p className="text-2xl font-semibold">
                {libraries.length}
              </p>

              <p className="text-sm text-muted-foreground">
                Carpetas visibles
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>

            <div>
              <p className="text-2xl font-semibold">
                {totalArticles}
              </p>

              <p className="text-sm text-muted-foreground">
                Artículos visibles
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>

            <div>
              <p className="text-2xl font-semibold">
                {totalDocuments}
              </p>

              <p className="text-sm text-muted-foreground">
                Documentos asociados
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        {rootLibraries.length > 0 ? (
          <div className="space-y-3">
            {rootLibraries.map((library) => (
              <LibraryNode
                key={library.id}
                library={library}
                libraries={libraries}
                level={0}
                visited={new Set()}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Network className="mx-auto h-8 w-8 text-muted-foreground" />

            <p className="mt-3 text-sm font-medium">
              No hay contenido visible
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Las carpetas, artículos y documentos aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}