
// components/knowledge/article/content/details/article-details-view.tsx

type ArticleDetailsViewProps = {
  knowledgeType: string;
  visibility: string;
  status: string;
  analysisStatus: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  procedure: "Procedimiento",
  process: "Proceso",
  policy: "Política",
  manual: "Manual",
  guide: "Guía",
  faq: "FAQ",
  technical: "Técnico",
  functional: "Funcional",
  unknown: "Sin clasificar",
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Privado",
  shared: "Compartido",
  public: "Público",
};

export function ArticleDetailsView({
  knowledgeType,
  visibility,
  status,
  analysisStatus,
}: ArticleDetailsViewProps) {
  return (
    <section className="rounded-xl border border-border bg-background p-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground">
          Detalles del artículo
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Información y estado del artículo.
        </p>
      </div>

      <dl className="grid gap-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Tipo
          </dt>

          <dd className="mt-1 text-sm font-medium text-foreground">
            {TYPE_LABELS[knowledgeType] ?? knowledgeType}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Visibilidad
          </dt>

          <dd className="mt-1 text-sm font-medium text-foreground">
            {VISIBILITY_LABELS[visibility] ?? visibility}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Estado
          </dt>

          <dd className="mt-1 text-sm font-medium text-foreground">
            {status}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Análisis de IA
          </dt>

          <dd className="mt-1 text-sm font-medium text-foreground">
            {analysisStatus ?? "Sin análisis"}
          </dd>
        </div>
      </dl>
    </section>
  );
}