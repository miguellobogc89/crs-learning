// lib/repositories/chat-message-feedback.repository.ts

import { prisma } from "@/lib/prisma";

export type ChatMessageFeedbackRating =
  | "positive"
  | "negative";

export async function getChatMessageFeedback(
  messageId: string,
  userId: string,
) {
  return prisma.chat_message_feedback.findUnique({
    where: {
      message_id_user_id: {
        message_id: messageId,
        user_id: userId,
      },
    },
  });
}

export async function setChatMessageFeedback(
  messageId: string,
  userId: string,
  rating: ChatMessageFeedbackRating,
) {
  return prisma.chat_message_feedback.upsert({
    where: {
      message_id_user_id: {
        message_id: messageId,
        user_id: userId,
      },
    },
    create: {
      message_id: messageId,
      user_id: userId,
      rating,
    },
    update: {
      rating,
      updated_at: new Date(),
    },
  });
}

export async function deleteChatMessageFeedback(
  messageId: string,
  userId: string,
) {
  return prisma.chat_message_feedback.deleteMany({
    where: {
      message_id: messageId,
      user_id: userId,
    },
  });
}