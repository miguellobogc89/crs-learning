import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { PersonalFinanceDashboard } from "@/components/personal-finance/personal-finance-dashboard";

export const dynamic = "force-dynamic";

export default async function PersonalFinancePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <AppSectionShell sidebar={
      <div className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">CRS Finance</p>
        <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700">Mis cuentas</p>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Este apartado es privado. Tus bancos, saldos y movimientos no pertenecen a ningún espacio de trabajo.
        </p>
      </div>
    }>
      <AppPageLayout header={
        <AppPageHeader
          section={APP_SECTIONS.personalFinance}
          title="Mis finanzas"
          description="Tus cuentas personales en un solo lugar · Acceso bancario de solo lectura"
        />
      }>
        <PersonalFinanceDashboard callbackError={Boolean(params.error)} />
      </AppPageLayout>
    </AppSectionShell>
  );
}
