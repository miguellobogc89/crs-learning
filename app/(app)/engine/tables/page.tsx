import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { EngineNavigation } from "@/components/engine/engine-navigation";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { listEngineObjectTypes, listEngineRecords } from "@/lib/engine/records.service";
import {
  listPendingEngineRelations, listApprovedEngineRelations,
} from "@/lib/engine/review-record-relation.service";
import { reviewEngineRelationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EngineTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const params = await searchParams;
  const view = params.view === "relations" ? "relations" : "tables";
  const types = await listEngineObjectTypes(activeWorkspace.id, session.user.id);
  const selected = types.find(type => type.id === params.type) ?? types[0];
  const records = view === "tables" && selected ? await listEngineRecords({
    workspaceId: activeWorkspace.id, userId: session.user.id,
    objectTypeId: selected.id, take: 100,
  }) : [];
  const fields = selected?.engine_field_definitions ?? [];
  const canReview = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const [pendingRelations, approvedRelations] = view === "relations"
    ? await Promise.all([
      listPendingEngineRelations({ workspaceId: activeWorkspace.id, userId: session.user.id }),
      listApprovedEngineRelations({ workspaceId: activeWorkspace.id, userId: session.user.id }),
    ])
    : [[], []];

  return (
    <AppSectionShell sidebar={
      <EngineNavigation types={types.map(type => ({ id: type.id, name: type.name, key: type.key }))}
        selectedId={selected?.id} view={view} />
    }>
      <AppPageLayout header={
        <AppPageHeader section={APP_SECTIONS.tables}
          title={view === "relations" ? "Relaciones" : selected?.name ?? "Tablas"} />
      } contentClassName="overflow-y-auto pb-6">
        {view === "tables" ? (
          <div className="space-y-5 pt-4">
            <p className="text-sm text-slate-500">
              Registros de {selected?.name ?? "las tablas"} en {activeWorkspace.name}.
              Consulta directa a la base de datos, sin análisis con IA.
            </p>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {selected ? <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">{selected.name}</h2>
                  <span className="text-xs text-slate-500">
                    {fields.length} campos · {records.length} registros mostrados (máximo 100)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        {fields.map(field => <th key={field.id} className="whitespace-nowrap px-4 py-3 font-semibold">
                          {field.name}
                        </th>)}
                        <th className="px-4 py-3 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map(record => {
                        const values = record.values_json && typeof record.values_json === "object" &&
                          !Array.isArray(record.values_json) ? record.values_json : {};
                        return <tr key={record.id} className="hover:bg-slate-50/70">
                          {fields.map(field => {
                            const value = (values as Record<string, unknown>)[field.key];
                            return <td key={field.id} className="max-w-[320px] truncate px-4 py-3 text-slate-700"
                              title={value == null ? "" : String(value)}>
                              {value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </td>;
                          })}
                          <td className="px-4 py-3 text-xs text-slate-500">{record.status}</td>
                        </tr>;
                      })}
                      {!records.length && <tr><td colSpan={fields.length + 1}
                        className="px-4 py-12 text-center text-sm text-slate-500">
                        Todavía no hay registros en esta tabla.
                      </td></tr>}
                    </tbody>
                  </table>
                </div>
              </> : <p className="p-10 text-center text-sm text-slate-500">
                Todavía no hay entidades en este espacio de trabajo.
              </p>}
            </section>
          </div>
        ) : (
          <div className="space-y-5 pt-4">
            <p className="text-sm text-slate-500">
              Relaciones almacenadas y propuestas que requieren revisión. Esta pantalla no utiliza IA.
            </p>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">
                Pendientes de revisión ({pendingRelations.length})
              </h2>
              <div className="mt-4 space-y-3">
                {pendingRelations.map(proposal => <div key={proposal.id}
                  className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {proposal.definition.name}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {proposal.definition.cardinality}
                    </span>
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
                        className="rounded-lg bg-[#0A58FF] px-3 py-2 text-xs font-semibold text-white">
                        Aprobar
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
                </div>)}
                {!pendingRelations.length && <p className="text-sm text-slate-500">
                  No hay relaciones pendientes.
                </p>}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">
                Relaciones aprobadas ({approvedRelations.length})
              </h2>
              <div className="mt-3 space-y-2">
                {approvedRelations.map(link => <div key={link.id}
                  className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  <strong>{link.definition.name}</strong> · {link.from_record_id} → {link.to_record_id}
                </div>)}
                {!approvedRelations.length && <p className="text-sm text-slate-500">
                  No hay relaciones aprobadas para los registros consultados.
                </p>}
              </div>
            </section>
          </div>
        )}
      </AppPageLayout>
    </AppSectionShell>
  );
}
