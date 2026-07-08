// app/(app)/assistant/[conversationId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { Bot, User } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChatComposer } from "@/components/assistant/chat-composer";

export default async function AssistantConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { conversationId } = await params;

  const conversation = await prisma.chat_conversations.findFirst({
    where: {
      id: conversationId,
      owner_user_id: session.user.id,
    },
    include: {
      chat_messages: {
        orderBy: {
          created_at: "asc",
        },
      },
    },
  });

  if (!conversation) {
    notFound();
  }

  return (
    <main className="flex h-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border bg-background px-8 py-4">
        <h1 className="text-sm font-semibold text-foreground">
          {conversation.title}
        </h1>
        <p className="text-xs text-muted-foreground">
          Conversación con CRS Assistant
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {conversation.chat_messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "flex justify-end"
                  : "flex justify-start"
              }
            >
              <div
                className={
                  message.role === "user"
                    ? "flex max-w-[80%] gap-3 rounded-2xl bg-brand px-5 py-4 text-white"
                    : "flex max-w-[80%] gap-3 rounded-2xl border border-border bg-panel px-5 py-4 text-foreground"
                }
              >
                <div className="mt-0.5 shrink-0">
                  {message.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4 text-brand" />
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm leading-6">
                  {message.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ChatComposer conversationId={conversation.id} />
    </main>
  );
}