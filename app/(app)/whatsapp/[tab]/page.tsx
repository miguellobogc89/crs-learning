import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { WhatsAppNavigation } from "@/components/whatsapp/navigation";
import { WhatsAppWorkspace } from "@/components/whatsapp/workspace";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
export const dynamic = "force-dynamic";
const TITLES: Record<string, string> = {
  contacts: "Contactos",
  chat: "Conversaciones",
  settings: "Números",
  templates: "Plantillas",
};
export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (tab === "leads") redirect("/whatsapp/contacts");
  if (!["contacts", "chat", "templates", "settings"].includes(tab)) notFound();
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  return <AppSectionShell sidebar={<div><h2 className="border-b border-slate-200/60 px-5 py-4 text-sm font-semibold">WhatsApp</h2><WhatsAppNavigation /></div>}>
    <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.whatsapp} items={[{ label: TITLES[tab] }]} title={TITLES[tab]} />} contentClassName="!overflow-hidden !pb-4">
      <WhatsAppWorkspace key={`${ctx.workspaceId}:${tab}`} tab={tab} />
    </AppPageLayout>
  </AppSectionShell>;
}
