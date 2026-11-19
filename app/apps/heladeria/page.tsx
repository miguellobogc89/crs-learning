import { IceCreamPlatformEntry } from "@/components/heladeria/platform-entry";
import { AppShell } from "@/components/platform/app-shell";

export default function IceCreamAppPage() {
  return <AppShell title="Heladería" activeAppId="heladeria"><IceCreamPlatformEntry /></AppShell>;
}
