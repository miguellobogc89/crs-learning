
// components/knowledge/article/content/general/article-general-view.tsx

type ArticleGeneralViewProps = {
  description: string | null;
  content: string;
};

export function ArticleGeneralView({
  description,
  content,
}: ArticleGeneralViewProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-border bg-background p-6">
        <h2 className="text-base font-semibold text-foreground">
          Resumen
        </h2>

        {description?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {description}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Este artículo todavía no tiene una descripción.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-background p-6">
        <h2 className="text-base font-semibold text-foreground">
          Contenido
        </h2>

        {content.trim() ? (
          <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
            {content}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Este artículo todavía no tiene contenido.
          </p>
        )}
      </div>
    </section>
  );
}