// Consumo de IA de las tres apps (Trade, Finance, Business) y sus ajustes.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AiUsagePanel } from "@/components/ai-usage-panel";

export const metadata = { title: "Consumo de IA" };

export default async function AiUsagePage() {
  if (!(await auth())?.user?.id) redirect("/");
  return <AiUsagePanel />;
}
