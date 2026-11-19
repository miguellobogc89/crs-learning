import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";

import { FinanceBottomTabs } from "@/components/finance/bottom-tabs";
import { FINANCE_SECTIONS, FINANCE_TABS, type FinanceTab } from "@/components/finance/tabs";
import { AppShell } from "@/components/platform/app-shell";

const FINANCE_PREVIEW_ROOT = "/apps/finanzas";

function FinanceSectionNavigation({ currentTab }: { currentTab: FinanceTab }) {
  return (
    <nav aria-label="Secciones de Finanzas" className="space-y-5">
      {FINANCE_SECTIONS.map((section) => (
        <div key={section.title ?? "principal"} className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {section.title ?? "Finanzas"}
          </p>
          {section.items.map((item) => {
            const selected = currentTab === item.key;
            return (
              <Link
                key={item.key}
                href={`${FINANCE_PREVIEW_ROOT}/${item.key}`}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${selected ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Interior navegable sin login, sin llamar a los servicios ni duplicar la lógica de Finanzas. */
export function FinancePlatformEntry({ tab = "inicio" }: { tab?: FinanceTab }) {
  const current = FINANCE_TABS.find((item) => item.key === tab)!;

  return (
    <AppShell
      title={current.label}
      activeAppId="finanzas"
      sectionNavigation={<FinanceSectionNavigation currentTab={tab} />}
      bottomNavigation={<FinanceBottomTabs basePath={FINANCE_PREVIEW_ROOT} />}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">CRS Finance</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">{current.label}</h2>
          <p className="max-w-lg text-sm leading-6 text-slate-500">{current.description}</p>
        </div>
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-12 text-center shadow-sm">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <current.icon className="size-7" strokeWidth={1.8} />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">{current.label} · Estructura preparada</h3>
            <p className="mx-auto max-w-sm text-sm leading-6 text-slate-500">
              Esta sección aún no tiene datos ni funcionalidades conectadas. Puedes probar la navegación sin iniciar sesión.
            </p>
          </div>
        </div>
        <Link href="/apps" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">
          <Wallet className="size-4" /> Mis aplicaciones <ArrowRight className="size-4" />
        </Link>
      </div>
    </AppShell>
  );
}
