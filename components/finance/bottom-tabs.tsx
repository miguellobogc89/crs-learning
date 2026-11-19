import { ModuleBottomTabs } from "@/components/platform/module-bottom-tabs";
import { BOTTOM_TABS, FINANCE_TABS } from "./tabs";

/** Navegación idéntica en Finanzas real y en la vista pública de CRS. */
export function FinanceBottomTabs({ basePath = "/finanzas" }: { basePath?: string }) {
  const tabs = BOTTOM_TABS.map((key) => {
    const tab = FINANCE_TABS.find((item) => item.key === key)!;
    return { href: `${basePath}/${key}`, label: tab.label, icon: tab.icon };
  });

  return <ModuleBottomTabs tabs={tabs} />;
}
