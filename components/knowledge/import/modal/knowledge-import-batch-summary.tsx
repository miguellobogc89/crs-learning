import type { ImportInventory } from "@/lib/knowledge/import/build-import-map";

export function KnowledgeImportBatchSummary({ inventory }: { inventory?: ImportInventory | null }) {
  if (inventory?.batchReview?.status !== "reviewed") return null;
  const failedFiles = inventory.files.filter(file => file.status === "error");
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <h4 className="text-sm font-semibold">Revisión conjunta del lote</h4>
      <p className="mt-1 text-xs text-slate-600">La confirmación guardará las fuentes y artículos en Knowledge. Engine solo genera una vista previa; su guardado sigue bloqueado.</p>
      {failedFiles.length > 0 ? <p className="mt-2 text-xs text-amber-800">{failedFiles.length} archivos no pudieron analizarse y quedan fuera de esta propuesta.</p> : null}
      <ul className="mt-3 space-y-4">
        {inventory.batchReview.groups.map((group, index) => {
          const documents = inventory.documents.filter(document => group.documentIds.includes(document.id));
          return <li key={index} className="text-xs">
            <p className="font-semibold">{group.title} · {documents.length} {documents.length === 1 ? "documento" : "documentos"}</p>
            <p className="mt-1 text-slate-600">{group.reason}</p>
            <ul className="mt-2 space-y-2 border-l border-blue-200 pl-3">
              {documents.map(document => <li key={document.id}>
                <p className="break-words font-medium">{document.title} · {document.fileName}</p>
                <p>{document.routing?.articleCandidate ? "Artículo de Knowledge" : "Documento de consulta"}{document.routing?.structuredCandidate ? " · Candidato para Engine" : ""}</p>
                <p className="text-slate-600">{document.routing?.reason}</p>
              </li>)}
            </ul>
          </li>;
        })}
      </ul>
    </section>
  );
}
