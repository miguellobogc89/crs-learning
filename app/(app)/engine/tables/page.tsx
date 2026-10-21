import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { listEngineObjectTypes, listEngineRecords } from "@/lib/engine/records.service";
import { listPendingEngineRelations, listApprovedEngineRelations } from "@/lib/engine/review-record-relation.service";
import { reviewEngineRelationAction, analyzeEngineRelationsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EngineTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; importStatus?: string; proposed?: string; issues?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return <main className="p-8 text-sm text-slate-600">Inicia sesión para consultar Engine.</main>;
  }
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const types = await listEngineObjectTypes(activeWorkspace.id, session.user.id);
  const params = await searchParams;
  const selected = types.find(type => type.id === params.type) ?? types[0];
  const records = selected ? await listEngineRecords({
    workspaceId: activeWorkspace.id, userId: session.user.id,
    objectTypeId: selected.id, take: 100,
  }) : [];
  const fields = selected?.engine_field_definitions ?? [];
  const [pendingRelations, approvedRelations] = await Promise.all([
    listPendingEngineRelations({ workspaceId: activeWorkspace.id, userId: session.user.id }),
    listApprovedEngineRelations({ workspaceId: activeWorkspace.id, userId: session.user.id,
      recordIds: records.map(record => record.id) }),
  ]);
  const canReview = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const sourceFiles = canReview ? await prisma.knowledge_files.findMany({
    where: { status: { in: ["ready", "processed"] },
      extracted_text: { not: "" },
      knowledge_sources: knowledgeSourceReadWhere(session.user.id, activeWorkspace.id) },
    select: { id: true, file_name: true, created_at: true },
    orderBy: { created_at: "desc" }, take: 50,
  }) : [];
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tablas de Engine</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vista de consulta de los tipos y registros del espacio de trabajo. No modifica datos.
        </p>
      </div>
      {canReview && <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Analizar relaciones de un documento existente</h2>
        <p className="mt-1 text-sm text-slate-500">
          Reanaliza un archivo de Knowledge ya procesado. Puede reutilizar registros y proponer vínculos
          con evidencia documental, pero nunca aprueba relaciones automáticamente.
        </p>
        {params.importStatus && <p className="mt-3 text-sm text-slate-700">
          Análisis: {params.importStatus} · Relaciones propuestas: {params.proposed ?? "0"} ·
          Incidencias: {params.issues ?? "0"}
        </p>}
        {sourceFiles.length ? <form action={analyzeEngineRelationsAction} className="mt-4 flex flex-wrap gap-2">
          <select name="knowledgeFileId" required defaultValue=""
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="" disabled>Selecciona un documento procesado</option>
            {sourceFiles.map(file => <option key={file.id} value={file.id}>{file.file_name}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Analizar relaciones
          </button>
        </form> : <p className="mt-3 text-sm text-slate-500">
          No hay archivos de Knowledge procesados y accesibles en este espacio de trabajo.
        </p>}
      </section>}
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <h2 className="px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Entidades ({types.length})
          </h2>
          <nav className="space-y-1">
            {types.map(type => (
              <Link key={type.id} href={`/engine/tables?type=${type.id}`}
                className={`block rounded-lg px-3 py-2 text-sm ${selected?.id === type.id
                  ? "bg-slate-900 font-semibold text-white"
                  : "text-slate-700 hover:bg-slate-100"}`}>
                {type.name}
                <span className="ml-2 text-xs opacity-60">{type.key}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
          {selected ? (
            <>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {fields.length} campos · {records.length} registros mostrados (máximo 100)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      {fields.map(field => (
                        <th key={field.id} className="whitespace-nowrap px-4 py-3 font-semibold">
                          {field.name}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map(record => {
                      const values = record.values_json && typeof record.values_json === "object" &&
                        !Array.isArray(record.values_json) ? record.values_json : {};
                      return (
                        <tr key={record.id} className="hover:bg-slate-50/70">
                          {fields.map(field => {
                            const value = (values as Record<string, unknown>)[field.key];
                            return <td key={field.id} className="max-w-[320px] truncate px-4 py-3 text-slate-700"
                              title={value === undefined ? "" : String(value)}>
                              {value === undefined || value === null ? "—" :
                                typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </td>;
                          })}
                          <td className="px-4 py-3 text-xs text-slate-500">{record.status}</td>
                        </tr>
                      );
                    })}
                    {records.length === 0 && (
                      <tr><td colSpan={fields.length + 1}
                        className="px-4 py-12 text-center text-sm text-slate-500">
                        Todavía no hay registros en esta entidad.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-sm text-slate-500">
              Todavía no hay tipos de entidad en Engine.
            </div>
          )}
        </section>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          Relaciones aprobadas ({approvedRelations.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">Vínculos relacionados con los registros visibles.</p>
        <div className="mt-3 space-y-2">
          {approvedRelations.map(link => (
            <div key={link.id} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <strong>{link.definition.name}</strong> · {link.from_record_id} → {link.to_record_id}
            </div>
          ))}
          {!approvedRelations.length && <p className="text-sm text-slate-500">No hay relaciones aprobadas para estos registros.</p>}
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          Relaciones pendientes de revisión ({pendingRelations.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">Revisa la evidencia antes de aprobar cada vínculo.</p>
        <div className="mt-4 space-y-3">
          {pendingRelations.map(proposal => (
            <div key={proposal.id} className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{proposal.definition.name}
                <span className="ml-2 text-xs font-normal text-slate-500">{proposal.definition.cardinality}</span>
              </p>
              <p className="mt-2 break-words text-xs text-slate-600">
                Origen: {JSON.stringify(proposal.from_record.values_json)}
              </p>
              <p className="mt-1 break-words text-xs text-slate-600">
                Destino: {JSON.stringify(proposal.to_record.values_json)}
              </p>
              <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-xs italic text-slate-600">
                {proposal.evidence_text}
              </blockquote>
              {canReview && <div className="mt-3 flex gap-2">
                <form action={reviewEngineRelationAction}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button name="decision" value="approve" type="submit"
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                    Aprobar vínculo
                  </button>
                </form>
                <form action={reviewEngineRelationAction}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button name="decision" value="reject" type="submit"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
                    Rechazar
                  </button>
                </form>
              </div>}
            </div>
          ))}
          {!pendingRelations.length && <p className="text-sm text-slate-500">No hay propuestas pendientes.</p>}
        </div>
      </section>
    </main>
  );
}
