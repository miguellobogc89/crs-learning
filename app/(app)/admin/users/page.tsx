// app/(app)/admin/users/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllUsers } from "@/lib/repositories/admin-user.repository";
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
  } catch (error) {
    redirect("/dashboard");
  }

  const users = await getAllUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <p className="mt-2 text-muted-foreground">
          Gestiona todos los usuarios del sistema. Puedes buscar, filtrar y editar
          información de usuarios.
        </p>
      </div>

      <UsersTable initialUsers={users} />
    </div>
  );
}
