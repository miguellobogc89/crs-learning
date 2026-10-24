import { EngineTableEditor, EngineSelectionHeader, EngineActionsHeader, EngineRowSelection, EngineRowActions } from "@/components/engine/engine-table-editor";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KnowledgeUploadTrigger } from "@/components/knowledge/import/knowledge-upload-trigger";
import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { EngineNavigation } from "@/components/engine/engine-navigation";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { listEngineObjectTypes, listEngineRecords } from "@/lib/engine/records.service";
import {
  formatEngineNumericValue, persistedInvoiceParties,
  invoiceDisplayCurrency, isMonetaryField,
} from "@/lib/engine/invoice-display";
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
  const isInvoice = selected?.key === "invoice";
  const visibleFields = isInvoice
    ? [
        ...fields.filter(field => field.key === "invoice_number"),
        ...fields.filter(field => field.key !== "invoice_number" && field.key !== "currency"),
      ]
    : fields;
  // Provenance is metadata, not part of the editable invoice schema.
  // Only invoice tables need this additional lookup.
  const invoiceSources = isInvoice && records.length
    ? await prisma.engine_record_provenance.findMany({
        where: {
          workspace_id: activeWorkspace.id,
          record_id: { in: records.map(record => record.id) },
          knowledge_file_id: { not: null },
        },
        distinct: ["record_id", "knowledge_file_id"],
        orderBy: { created_at: "asc" },
        select: { record_id: true, knowledge_file_id: true },
      })
    : [];
  // Fetch each source file only once. A single record may have many evidence
  // rows, which would otherwise repeatedly hydrate the same PDF text.
  const sourceFileIds = [...new Set(invoiceSources
    .map(source => source.knowledge_file_id)
    .filter((id): id is string => !!id))];
  const invoiceFiles = sourceFileIds.length
    ? await prisma.knowledge_files.findMany({
        where: { id: { in: sourceFileIds } },
        select: { id: true, file_name: true, extracted_text: true },
      })
    : [];
  const invoiceFileById = new Map(invoiceFiles.map(file => [file.id, file]));
  const sourceNamesByRecord = new Map<string, Set<string>>();
  const sourceTextsByRecord = new Map<string, string>();
  for (const source of invoiceSources) {
    const file = source.knowledge_file_id && invoiceFileById.get(source.knowledge_file_id);
    if (!file) continue;
    const names = sourceNamesByRecord.get(source.record_id) ?? new Set<string>();
    names.add(file.file_name);
    sourceNamesByRecord.set(source.record_id, names);
    if (!sourceTextsByRecord.has(source.record_id) && file.extracted_text) {
      sourceTextsByRecord.set(source.record_id, file.extracted_text);
    }
  }
  // Parties are actual workspace-private company records linked to the invoice.
  // Do not infer legal roles from PDF layout or service labels at render time.
  const partyLinks = isInvoice && records.length ? await prisma.engine_record_relations.findMany({
    where: { workspace_id: activeWorkspace.id, to_record_id: { in: records.map(r=>r.id) },
      definition: { status: "active", key: { in: ["invoice_issuer", "invoice_customer"] } },
      from_record: { status: { not: "archived" } }, to_record: { status: { not: "archived" } } },
    select: { to_record_id: true, definition: { select: { key: true } }, from_record: { select: { values_json: true } } },
  }) : [];
  const partiesByRecord = persistedInvoiceParties(partyLinks);
  const canReview = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const importLibrary = view === "tables" && canReview ? await prisma.knowledge_libraries.findFirst({
    where: { workspace_id: activeWorkspace.id, owner_user_id: session.user.id, parent_id: null },
    select: { id: true }, orderBy: { created_at: "asc" },
  }) : null;
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
            {canReview && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Importación documental</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Un solo flujo: Knowledge clasifica, Engine verifica los registros y la confirmación final aplica los cambios.
                  </p>
                </div>
                {importLibrary ? (
                  <KnowledgeUploadTrigger context={{ origin: "root", libraryId: importLibrary.id }} label="Importar documentos" />
                ) : (
                  <span className="text-xs text-amber-700">Crea primero una biblioteca propia en Knowledge.</span>
                )}
              </section>
            )}
            <p className="text-sm text-slate-500">
              Registros de {selected?.name ?? "las tablas"} en {activeWorkspace.name}.
              Consulta directa a la base de datos, sin análisis con IA.
            </p>
            <EngineTableEditor key={selected?.id ?? "empty"} enabled={canReview && !!selected}
              fields={fields.map(field => ({ key: field.key, name: field.name, field_type: field.field_type,
                is_required: field.is_required, is_unique: field.is_unique, configuration: field.configuration }))}
              records={records.map(record => ({ id: record.id, revision: record.revision,
                values: record.values_json && typeof record.values_json === "object" && !Array.isArray(record.values_json)
                  ? record.values_json as Record<string, unknown> : {} }))}>
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
                        <EngineSelectionHeader />
                        {!isInvoice ? (
                          <th className="whitespace-nowrap px-4 py-3 font-semibold">ID</th>
                        ) : null}
                        {isInvoice ? (
                          <>
                            <th className="whitespace-nowrap px-4 py-3 font-semibold">Número de factura</th>
                            <th className="whitespace-nowrap px-4 py-3 font-semibold">Emisor</th>
                            <th className="whitespace-nowrap px-4 py-3 font-semibold">Cliente</th>
                            <th className="whitespace-nowrap px-4 py-3 font-semibold">Documento origen</th>
                          </>
                        ) : null}
                        {visibleFields.filter(field => !isInvoice || field.key !== "invoice_number")
                          .map(field => (
                            <th key={field.id} className={
                              "whitespace-nowrap px-4 py-3 font-semibold " +
                              (isInvoice && isMonetaryField(field) ? "text-right" : "")
                            }>
                              {field.name}
                            </th>
                          ))}
                        <th className="px-4 py-3 font-semibold">Estado</th>
                        <EngineActionsHeader />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map(record => {
                        const values = record.values_json && typeof record.values_json === "object" &&
                          !Array.isArray(record.values_json) ? record.values_json : {};
                        const attributes = values as Record<string, unknown>;
                        const sourceText = sourceTextsByRecord.get(record.id);
                        const parties = isInvoice ? partiesByRecord.get(record.id) : null;
                        const currency = isInvoice ? invoiceDisplayCurrency(attributes, sourceText) : null;
                        return <tr key={record.id} className="hover:bg-slate-50/70">
                          <EngineRowSelection id={record.id} />
                          {!isInvoice ? (
                            <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs text-slate-500"
                              title={record.id}>{record.id}</td>
                          ) : (
                            <>
                              <td className="max-w-[220px] whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                                {typeof attributes.invoice_number === "string" ? attributes.invoice_number : "—"}
                              </td>
                              <td className="max-w-[260px] truncate px-4 py-3 text-slate-700"
                                title={parties?.issuer ?? ""}>{parties?.issuer ?? "—"}</td>
                              <td className="max-w-[260px] truncate px-4 py-3 text-slate-700"
                                title={parties?.customer ?? ""}>{parties?.customer ?? "—"}</td>
                              <td className="max-w-[290px] px-4 py-3 text-xs text-slate-700">
                                {sourceNamesByRecord.has(record.id) ? (
                                  <div className="space-y-1">
                                    {[...sourceNamesByRecord.get(record.id)!].map(name => (
                                      <div key={name} className="max-w-[290px] truncate" title={name}>
                                        {name}
                                      </div>
                                    ))}
                                  </div>
                                ) : "—"}
                              </td>
                            </>
                          )}
                          {visibleFields.filter(field => !isInvoice || field.key !== "invoice_number")
                            .map(field => {
                              const value = attributes[field.key];
                              const formatted = isInvoice ? formatEngineNumericValue(value, field, currency) : null;
                              const display = formatted ?? (value == null ? "—" :
                                typeof value === "object" ? JSON.stringify(value) : String(value));
                              return <td key={field.id} className={
                                "max-w-[320px] truncate px-4 py-3 text-slate-700 " +
                                (isInvoice && isMonetaryField(field) ? "text-right tabular-nums whitespace-nowrap" : "")
                              } title={display}>
                                {display}
                              </td>;
                            })}
                          <td className="px-4 py-3 text-xs text-slate-500">{record.status}</td>
                          <EngineRowActions id={record.id} />
                        </tr>;
                      })}
                      {!records.length && <tr><td colSpan={visibleFields.length + (isInvoice ? 3 : 2)}
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
            </EngineTableEditor>
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
