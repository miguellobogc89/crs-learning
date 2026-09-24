
// components/knowledge/article/header/article-title.tsx

"use client";

import { Check, Pencil, X } from "lucide-react";

type ArticleTitleProps = {
  title: string;
  isEditing: boolean;
  isUpdating: boolean;
  onTitleChange: (title: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function ArticleTitle({
  title,
  isEditing,
  isUpdating,
  onTitleChange,
  onEdit,
  onSave,
  onCancel,
}: ArticleTitleProps) {
  if (isEditing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          autoFocus
          value={title}
          disabled={isUpdating}
          onChange={(event) =>
            onTitleChange(event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSave();
            }

            if (event.key === "Escape") {
              onCancel();
            }
          }}
          aria-label="Título del artículo"
          className="min-w-0 flex-1 rounded-lg border border-blue-300 bg-background px-3 py-1.5 text-2xl font-semibold tracking-tight text-foreground outline-none ring-blue-500/20 focus:ring-4 dark:border-blue-700"
        />

        <button
          type="button"
          onClick={onSave}
          disabled={isUpdating || !title.trim()}
          aria-label="Guardar título"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={isUpdating}
          aria-label="Cancelar edición"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex min-w-0 items-center gap-2">
      <h1 className="min-w-0 truncate text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>

      <button
        type="button"
        onClick={onEdit}
        disabled={isUpdating}
        aria-label="Editar título"
        title="Editar título"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-all hover:bg-blue-50 hover:text-blue-600 hover:opacity-100 disabled:opacity-30 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}