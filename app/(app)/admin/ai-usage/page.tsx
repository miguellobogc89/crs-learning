// app/(app)/admin/ai-usage/page.tsx

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";

import { AdminPage } from "@/components/admin/admin-page";
import { AiUsageStats } from "@/components/admin/ai-usage/stats";
import { AiUsageChart } from "@/components/admin/ai-usage/chart";
import { AiFeedbackSummary } from "@/components/admin/ai-usage/feedback-summary";
import { AiNegativeFeedbackTable } from "@/components/admin/ai-usage/negative-feedback-table";

import {
  getAiUsageStats,
  getAiUsageChart,
} from "@/lib/repositories/admin/ai-usage.repository";

export default async function AdminAiUsagePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  try {
    await requireAdmin(session.user.id);
  } catch {
    redirect("/dashboard");
  }

  const [usageStats, usageData] = await Promise.all([
    getAiUsageStats(),
    getAiUsageChart(30),
  ]);

  const stats = {
    weeklyTokens: usageStats.weeklyTokens,
    activeUsers: usageStats.activeUsers,
    averageTokensPerUser:
      usageStats.averageTokensPerUser,
    satisfactionRate: null as number | null,
  };

  const feedback = {
    positive: 0,
    negative: 0,
    total: 0,
    satisfactionRate: null as number | null,
  };

  const negativeFeedback: Array<{
    id: string;
    userName: string;
    userEmail: string;
    question: string;
    createdAt: Date;
  }> = [];

  return (
    <AdminPage
      title="Uso de IA"
      subtitle="Analiza el consumo, adopción y calidad del asistente de CRS."
      summary={
        <AiUsageStats stats={stats} />
      }
    >
      <div className="space-y-6">
        <AiUsageChart data={usageData} />

        <AiFeedbackSummary
          feedback={feedback}
        />

        <AiNegativeFeedbackTable
          feedback={negativeFeedback}
        />
      </div>
    </AdminPage>
  );
}