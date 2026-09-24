
// components/knowledge/article/content/documents/article-documents-view.tsx

import { FileText } from "lucide-react";

type ArticleDocument = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  status: string;
};

type ArticleDocumentsViewProps = {
  documents: ArticleDocument[];
};

function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return "Tamaño desconocido";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArticleDocumentsView({
  documents,
}: ArticleDocumentsViewProps) {
  return (
    <section className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-base font-semibold text-foreground">
          Documentos
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {documents.length}{" "}
          {documents.length === 1
            ? "documento asociado"
            : "documentos asociados"}
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <FileText className="h-6 w-6" />
          </div>

          <p className="mt-4 text-sm font-medium text-foreground">
            Todavía no hay documentos
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Los archivos asociados al artículo aparecerán aquí.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-4 px-6 py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <FileText className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {document.file_name}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {formatFileSize(document.file_size)}
                  {" · "}
                  {document.status}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}