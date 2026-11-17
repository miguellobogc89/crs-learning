import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { AppWorkspaceLayout } from "@/components/app/app-workspace-layout";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** Personal finance reuses the application shell, without fetching or requiring a business workspace. */
export default async function PersonalFinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return (
    <Sheet>
      <div className="flex h-screen min-h-0 overflow-hidden bg-white text-foreground">
        <AppWorkspaceLayout
          isAdmin={false}
          notificationCount={0}
          sidebarHeader={<span className="text-sm font-semibold text-slate-700">Finanzas personales</span>}
          topbar={<AppTopbar user={session.user} notifications={[]} unreadNotificationCount={0} />}
        >
          {children}
        </AppWorkspaceLayout>
        <SheetContent side="left" className="w-[min(20rem,86vw)] gap-0 p-0 lg:hidden">
          <SheetTitle className="sr-only">Navegación principal</SheetTitle>
          <AppSidebar mobile notificationCount={0} />
        </SheetContent>
      </div>
    </Sheet>
  );
}
