// app/(app)/layout.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";

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
    <div className="flex h-screen bg-[#0b0f14] text-slate-100">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar user={session.user} />

        <main className="min-h-0 flex-1 overflow-auto bg-[#111827]">
          {children}
        </main>
      </div>
    </div>
  );
}