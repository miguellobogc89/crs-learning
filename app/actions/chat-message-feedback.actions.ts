// app/actions/chat-message-feedback.actions.ts

"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import {
  deleteChatMessageFeedback,
  setChatMessageFeedback,
  type ChatMessageFeedbackRating,
} from "@/lib/repositories/chat-message-feedback.repository";

export async function rateChatMessageAction(
  messageId: string,
  rating: ChatMessageFeedbackRating | null,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  if (!messageId) {
    throw new Error("Message ID is required");
  }

  if (
    rating !== null &&
    rating !== "positive" &&
    rating !== "negative"
  ) {
    throw new Error("Invalid rating");
  }

  const userId = session.user.id;

  const message = await prisma.chat_messages.findFirst({
    where: {
      id: messageId,
      user_id: userId,
      role: "assistant",
    },
    select: {
      id: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (rating === null) {
    await deleteChatMessageFeedback(
      messageId,
      userId,
    );

    return {
      rating: null,
    };
  }

  await setChatMessageFeedback(
    messageId,
    userId,
    rating,
  );

  return {
    rating,
  };
}