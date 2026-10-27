import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { connectionView, connectorContext } from "@/lib/connectors/google-drive/connection";
import { workspaceLibrary } from "@/lib/connectors/google-drive/sync";
import { DriveFilesManager } from "@/components/connectors/drive-files-manager";

export const dynamic = "force-dynamic";

/** Every document of the connected Drive folder: what has been brought, saved or is pending; queue the rest. */
export default async function DriveDocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const view = await connectionView(ctx.workspaceId);
  if (view.status !== "active" || !view.settings.folder) redirect("/connectors");
  const library = await workspaceLibrary(ctx.workspaceId, ctx.userId);
  return <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.connectors} title="Documentos de Drive" />} contentClassName="overflow-y-auto pb-6">
    <div className="mx-auto max-w-5xl space-y-4 pt-4">
      <p className="text-sm text-slate-500">
        Carpeta <b className="font-medium text-slate-700">{view.settings.folder.name}</b> de {view.email}. <Link href="/connectors" className="text-[#0A58FF] hover:underline">Volver a Conectores</Link>
      </p>
      {!library && ctx.canManage && <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Crea primero una biblioteca propia en Conocimiento: las importaciones se guardan allí.</p>}
      <DriveFilesManager libraryId={library?.id ?? null} />
    </div>
  </AppPageLayout>;
}
