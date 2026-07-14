// app/(app)/layout.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { AutoBreadcrumb } from "@/components/app/auto-breadcrumb";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

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
    </div>
  );
}