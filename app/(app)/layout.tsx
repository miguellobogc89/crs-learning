import { IntakeQueue } from "@/components/knowledge/import/intake-queue";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isUserAdmin } from "@/lib/auth/admin";

import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { AppWorkspaceLayout } from "@/components/app/app-workspace-layout";
import { WorkspaceSelector } from "@/components/workspace/workspace-selector";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

import { AutoBreadcrumb } from "@/components/app/auto-breadcrumb";
import { FloatingChat } from "@/components/chat/floating-chat";
import { getAssistantSuggestions } from "@/lib/services/workspace-preferences.service";





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
    isAdmin,
    assistantSuggestions,
  ] = await Promise.all([
    listChatConversations(
      session.user.id,
      workspaceContext.activeWorkspace.id,
    ),

    getUserNotificationSummary(session.user.id, {
      take: 6,
    }),

    isUserAdmin(session.user.id),

    getAssistantSuggestions(workspaceContext.activeWorkspace.id),
  ]);

  return (
    <>
      <IntakeQueue />
      <Sheet>
        <div
          className="
            flex h-screen min-h-0 overflow-hidden
            bg-white text-foreground
          "
        >
          <AppWorkspaceLayout
            isAdmin={isAdmin}
            notificationCount={notificationSummary.unreadCount}
            sidebarHeader={
              <WorkspaceSelector
                activeWorkspace={workspaceContext.activeWorkspace}
                workspaces={workspaceContext.workspaces}
              />
            }
            topbar={
              <AppTopbar
                user={session.user}
                notifications={notificationSummary.notifications}
                unreadNotificationCount={
                  notificationSummary.unreadCount
                }
                activeWorkspace={workspaceContext.activeWorkspace}
                workspaces={workspaceContext.workspaces}
                breadcrumb={<AutoBreadcrumb />}
              />
            }
          >
            {children}
          </AppWorkspaceLayout>

          <FloatingChat
            conversations={conversations}
            suggestions={assistantSuggestions ?? undefined}
            hideTrigger
          />


        </div>

        <SheetContent
          side="left"
          className="w-[min(20rem,86vw)] gap-0 p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">
            Navegación principal
          </SheetTitle>

          <AppSidebar
            mobile
            isAdmin={isAdmin}
            notificationCount={notificationSummary.unreadCount}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}