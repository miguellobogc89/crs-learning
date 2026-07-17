// app/(app)/layout.tsx

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { AutoBreadcrumb } from "@/components/app/auto-breadcrumb";
import { FloatingChat } from "@/components/chat/floating-chat";
import { listChatConversations } from "@/lib/services/chat.service";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const conversations = await listChatConversations(
    session.user.id,
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          user={session.user}
          breadcrumb={<AutoBreadcrumb />}
        />

        <main className="min-h-0 flex-1 overflow-hidden bg-background">
          {children}
        </main>
      </div>

      <FloatingChat conversations={conversations} />
    </div>
  );
}