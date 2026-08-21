// app/(app)/layout.tsx

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { AutoBreadcrumb } from "@/components/app/auto-breadcrumb";
import { FloatingChat } from "@/components/chat/floating-chat";
import {
  KnowledgeImportProvider,
} from "@/components/knowledge/import/background/knowledge-import-provider";
import {
  KnowledgeImportBackgroundWidget,
} from "@/components/knowledge/import/background/knowledge-import-background-widget";
import { listChatConversations } from "@/lib/services/chat.service";
import { getUserNotificationSummary } from "@/lib/services/notification.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspaceContext = await getActiveWorkspaceContext(
    session.user.id,
  );

  const [
    conversations,
    notificationSummary,
  ] = await Promise.all([
    listChatConversations(
      session.user.id,
      workspaceContext.activeWorkspace.id,
    ),
    getUserNotificationSummary(
      session.user.id,
      {
        take: 6,
      },
    ),
  ]);

  return (
    <KnowledgeImportProvider>
      <Sheet>
        <div className="flex h-screen bg-background text-foreground">
          <AppSidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <AppTopbar
              user={session.user}
              notifications={
                notificationSummary.notifications
              }
              unreadNotificationCount={
                notificationSummary.unreadCount
              }
              activeWorkspace={
                workspaceContext.activeWorkspace
              }
              workspaces={
                workspaceContext.workspaces
              }
              breadcrumb={
                <AutoBreadcrumb />
              }
            />

            <main className="min-h-0 flex-1 overflow-hidden bg-background">
              {children}
            </main>
          </div>

          <FloatingChat
            conversations={
              conversations
            }
            hideTrigger
          />

          <KnowledgeImportBackgroundWidget />
        </div>

        <SheetContent
          side="left"
          className="w-[min(20rem,86vw)] gap-0 p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">Navegación principal</SheetTitle>
          <AppSidebar mobile />
        </SheetContent>
      </Sheet>
    </KnowledgeImportProvider>
  );
}
