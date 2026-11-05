import { redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { TendersWorkspace } from "@/components/tenders/tenders-workspace";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  return (
    <AppPageLayout
      header={
        <AppPageHeader
          section={APP_SECTIONS.tenders}
          title="Licitaciones abiertas"
          description="Contratos públicos en plazo de toda España: simplificados abreviados (menos de 60.000 €), simplificados (hasta 140.000 €) y contratos menores publicados con plazo. Fuente: Plataforma de Contratación del Sector Público."
        />
      }
      contentClassName="!pb-6"
    >
      <TendersWorkspace key={ctx.workspaceId} />
    </AppPageLayout>
  );
}
