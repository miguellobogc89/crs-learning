import { FinancePlatformEntry } from "@/components/finance/platform-entry";
import { AppShell } from "@/components/platform/app-shell";

export default function FinanceAppPage() {
  return <AppShell title="Finances" activeAppId="finanzas"><FinancePlatformEntry /></AppShell>;
}
