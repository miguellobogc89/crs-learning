// lib/repositories/admin/ai-usage.repository.ts

import { prisma } from "@/lib/prisma";

export type AiUsageStats = {
  weeklyTokens: number;
  previousWeekTokens: number;
  weeklyChangePercentage: number | null;
  activeUsers: number;
  averageTokensPerUser: number;
};

export type AiUsageChartPoint = {
  date: string;
  tokens: number;
};

export type AiFeedbackSummary = {
  positive: number;
  negative: number;
  total: number;
  satisfactionRate: number | null;
};

export type NegativeAiFeedbackItem = {
  id: string;
  userName: string;
  userEmail: string;
  question: string;
  answer: string;
  createdAt: Date;
};

function getStartOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function getStartOfWeek(date: Date) {
  const result = getStartOfDay(date);

  const day = result.getDay();

  const daysSinceMonday =
    day === 0 ? 6 : day - 1;

  result.setDate(
    result.getDate() - daysSinceMonday,
  );

  return result;
}

function getMessageTokens(message: {
  tokens_input: number | null;
  tokens_output: number | null;
}) {
  return (
    (message.tokens_input ?? 0) +
    (message.tokens_output ?? 0)
  );
}

export async function getAiFeedbackSummary(): Promise<AiFeedbackSummary> {
  const feedback =
    await prisma.chat_message_feedback.findMany({
      select: {
        rating: true,
      },
    });

  let positive = 0;
  let negative = 0;

  for (const item of feedback) {
    if (item.rating === "positive") {
      positive += 1;
    }

    if (item.rating === "negative") {
      negative += 1;
    }
  }

  const total =
    positive + negative;

  let satisfactionRate: number | null = null;

  if (total > 0) {
    satisfactionRate =
      Math.round(
        (positive / total) * 100,
      );
  }

  return {
    positive,
    negative,
    total,
    satisfactionRate,
  };
}

export async function getNegativeAiFeedback(): Promise<
  NegativeAiFeedbackItem[]
> {
  const feedback =
    await prisma.chat_message_feedback.findMany({
      where: {
        rating: "negative",
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        id: true,
        created_at: true,
        users: {
          select: {
            name: true,
            email: true,
          },
        },
        chat_messages: {
          select: {
            id: true,
            content: true,
            conversation_id: true,
            created_at: true,
          },
        },
      },
    });

  const items: NegativeAiFeedbackItem[] = [];

  for (const item of feedback) {
    const assistantMessage =
      item.chat_messages;

    const previousUserMessage =
      await prisma.chat_messages.findFirst({
        where: {
          conversation_id:
            assistantMessage.conversation_id,
          role: "user",
          created_at: {
            lt: assistantMessage.created_at,
          },
        },
        orderBy: {
          created_at: "desc",
        },
        select: {
          content: true,
        },
      });

    items.push({
      id: item.id,
      userName:
        item.users.name ?? "Sin nombre",
      userEmail:
        item.users.email,
      question:
        previousUserMessage?.content ??
        "Pregunta no encontrada",
      answer:
        assistantMessage.content,
      createdAt:
        item.created_at,
    });
  }

  return items;
}

export async function getAiUsageStats(): Promise<AiUsageStats> {
  const now = new Date();

  const currentWeekStart =
    getStartOfWeek(now);

  const previousWeekStart =
    new Date(currentWeekStart);

  previousWeekStart.setDate(
    previousWeekStart.getDate() - 7,
  );

  const messages =
    await prisma.chat_messages.findMany({
      where: {
        role: "assistant",
        created_at: {
          gte: previousWeekStart,
        },
      },
      select: {
        user_id: true,
        tokens_input: true,
        tokens_output: true,
        created_at: true,
      },
    });

  let weeklyTokens = 0;
  let previousWeekTokens = 0;

  const activeUserIds =
    new Set<string>();

  for (const message of messages) {
    const tokens =
      getMessageTokens(message);

if (
  message.created_at >=
  currentWeekStart
) {
  weeklyTokens += tokens;

  const hasUsage =
    message.tokens_input !== null ||
    message.tokens_output !== null;

  if (
    message.user_id &&
    hasUsage
  ) {
    activeUserIds.add(
      message.user_id,
    );
  }

  continue;
}

    previousWeekTokens += tokens;
  }

  const activeUsers =
    activeUserIds.size;

  const averageTokensPerUser =
    activeUsers > 0
      ? Math.round(
          weeklyTokens /
            activeUsers,
        )
      : 0;

  let weeklyChangePercentage:
    | number
    | null = null;

  if (previousWeekTokens > 0) {
    weeklyChangePercentage =
      Math.round(
        ((weeklyTokens -
          previousWeekTokens) /
          previousWeekTokens) *
          100,
      );
  }

  return {
    weeklyTokens,
    previousWeekTokens,
    weeklyChangePercentage,
    activeUsers,
    averageTokensPerUser,
  };
}

export async function getAiUsageChart(
  days = 30,
): Promise<AiUsageChartPoint[]> {
  const today =
    getStartOfDay(new Date());

  const startDate =
    new Date(today);

  startDate.setDate(
    startDate.getDate() -
      (days - 1),
  );

  const messages =
    await prisma.chat_messages.findMany({
      where: {
        role: "assistant",
        created_at: {
          gte: startDate,
        },
      },
      select: {
        created_at: true,
        tokens_input: true,
        tokens_output: true,
      },
      orderBy: {
        created_at: "asc",
      },
    });

  const tokensByDate =
    new Map<string, number>();

  for (
    let index = 0;
    index < days;
    index += 1
  ) {
    const date =
      new Date(startDate);

    date.setDate(
      startDate.getDate() +
        index,
    );

    const key =
      date
        .toISOString()
        .slice(0, 10);

    tokensByDate.set(key, 0);
  }

  for (const message of messages) {
    const key =
      message.created_at
        .toISOString()
        .slice(0, 10);

    const current =
      tokensByDate.get(key) ?? 0;

    tokensByDate.set(
      key,
      current +
        getMessageTokens(message),
    );
  }

  return Array.from(
    tokensByDate.entries(),
  ).map(([date, tokens]) => ({
    date,
    tokens,
  }));
}