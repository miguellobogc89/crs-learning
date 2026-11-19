import { BusinessPlatformEntry } from "@/components/dashboard/platform-entry";
import { AppShell } from "@/components/platform/app-shell";

export default function BusinessAppPage() {
  return <AppShell title="CRS" activeAppId="negocio"><BusinessPlatformEntry /></AppShell>;
}
