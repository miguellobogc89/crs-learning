// components/knowledge/intake/modal/knowledge-intake-summary.tsx

type Props = {
  documentCount: number;
  createdArticles: number;
  updatedArticles: number;
  duplicateDocuments: number;
  createdFolders?: number;
};

export function KnowledgeIntakeSummary({
  documentCount,
  createdArticles,
  updatedArticles,
  duplicateDocuments,
  createdFolders = 0,
}: Props) {
  const items = [
    {
      label: "Documentos",
      value: documentCount,
    },
    {
      label: "Artículos nuevos",
      value: createdArticles,
    },
    {
      label: "Actualizaciones",
      value: updatedArticles,
    },
    {
      label: "Duplicados",
      value: duplicateDocuments,
    },
    {
      label: "Carpetas nuevas",
      value: createdFolders,
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-muted/20 p-3"
        >
          <p className="text-xl font-semibold text-foreground">
            {item.value}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}