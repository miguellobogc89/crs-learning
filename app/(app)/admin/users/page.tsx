// app/(app)/admin/users/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllUsers } from "@/lib/repositories/admin/user.repository";

import { AdminPage } from "@/components/admin/admin-page";
import { UsersTable } from "@/components/admin/users-table";

export const metadata = {
  title: "Usuarios - Administración | CRS Learning",
  description: "Gestión de usuarios del sistema",
};

export default async function UsersPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  try {
    await requireAdmin(session.user.id);
  } catch {
    redirect("/dashboard");
  }

  const users = await getAllUsers();

  return (
    <AdminPage
      title="Usuarios"
      subtitle="Gestiona todos los usuarios del sistema. Puedes buscar, filtrar y editar información de usuarios."
    >
      <UsersTable initialUsers={users} />
    </AdminPage>
  );
}