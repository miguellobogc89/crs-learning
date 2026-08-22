// app/(app)/admin/layout.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  try {
    await requireAdmin(session.user.id);
  } catch (error) {
    redirect("/dashboard");
  }

  return (
    <AppSectionShell
      sidebar={<AdminSidebar />}
    >
      <main className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-10">
          {children}
        </div>
      </main>
    </AppSectionShell>
  );
}
