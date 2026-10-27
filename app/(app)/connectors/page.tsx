import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { connectionView, connectorContext } from "@/lib/connectors/google-drive/connection";
import { DriveConnectorCard } from "@/components/connectors/drive-connector-card";

export const dynamic = "force-dynamic";

const SOON = [
  { name: "Gmail", text: "Facturas que llegan como adjunto al correo." },
  { name: "OneDrive / SharePoint", text: "Carpetas de Microsoft 365." },
  { name: "Dropbox", text: "Carpetas compartidas con tu gestoría." },
];

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<{ drive?: string; message?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const params = await searchParams;
  const view = await connectionView(ctx.workspaceId);
  const flash = params.drive === "connected" ? { kind: "connected" as const } : params.drive === "error" ? { kind: "error" as const, message: params.message?.slice(0, 300) } : null;
  return <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.connectors} title="Conectores" />} contentClassName="overflow-y-auto pb-6">
    <div className="mx-auto max-w-3xl space-y-5 pt-4">
      <p className="text-sm text-slate-500">Conecta las aplicaciones de donde salen tus documentos. Las conexiones son del espacio de trabajo <b className="font-medium text-slate-700">{ctx.workspaceName}</b>.</p>
      <DriveConnectorCard canManage={ctx.canManage} flash={flash}
        initial={{ status: view.status, email: view.email, name: view.name, connectedAt: view.connectedAt, lastError: view.lastError,
          folder: view.settings.folder ? { id: view.settings.folder.id, name: view.settings.folder.name } : null, lastSync: view.settings.lastSync ?? null }} />
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Próximamente</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SOON.map(s => <div key={s.name} className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-4">
            <p className="text-sm font-medium text-slate-700">{s.name}</p><p className="mt-0.5 text-xs text-slate-500">{s.text}</p></div>)}
        </div>
      </div>
    </div>
  </AppPageLayout>;
}
