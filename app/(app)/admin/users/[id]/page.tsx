// app/(app)/admin/users/[id]/page.tsx
import { redirect, notFound } from "next/navigation";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
import { getUserDetail } from "@/lib/repositories/admin-user.repository";
import { UserEditForm } from "@/components/admin/user-edit-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Detalle de Usuario - Administración | CRS Learning",
  description: "Detalle y edición de usuario",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  try {
    await requireAdmin(session.user.id);
  } catch (error) {
    redirect("/dashboard");
  }

  const user = await getUserDetail(id);

  if (!user) {
    notFound();
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/users">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a usuarios
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main form */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-6">Información del usuario</h2>
            <UserEditForm
              user={{
                id: user.id,
                email: user.email,
                name: user.name,
                status: user.status,
              }}
            />
          </div>
        </div>

        {/* Sidebar with stats */}
        <div className="space-y-4">
          {/* User metadata */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-4">Información general</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Email verificado</p>
                <p className="font-medium">
                  {user.email_verified_at ? "Sí" : "No"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Proveedor</p>
                <p className="font-medium capitalize">
                  {user.provider || "Credenciales"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Nivel</p>
                <p className="font-medium">{user.level}</p>
              </div>

              <div>
                <p className="text-muted-foreground">XP</p>
                <p className="font-medium">{user.xp}</p>
              </div>
            </div>
          </div>

          {/* Activity stats */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-4">Actividad</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Fecha de alta</p>
                <p className="font-medium">
                  {new Date(user.created_at).toLocaleDateString("es-ES")}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Último acceso</p>
                <p className="font-medium">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleDateString(
                        "es-ES",
                      )
                    : "Nunca"}
                </p>
              </div>
            </div>
          </div>

          {/* Usage stats */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-4">Uso</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Workspaces</p>
                <p className="font-medium">{user.workspace_members.length}</p>
              </div>

              <div>
                <p className="text-muted-foreground">Archivos</p>
                <p className="font-medium">
                  {user.knowledge_files.length}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Almacenamiento</p>
                <p className="font-medium">
                  {formatBytes(user.totalStorageBytes)}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Conversaciones</p>
                <p className="font-medium">
                  {
                    user.chat_conversations_chat_conversations_owner_user_idTousers
                      .length
                  }
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Acciones registradas</p>
                <p className="font-medium">{user.knowledge_activity.length}</p>
              </div>
            </div>
          </div>

          {/* Workspaces */}
          {user.workspace_members.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-4">Workspaces</h3>
              <div className="space-y-2 text-sm">
                {user.workspace_members.map((membership) => (
                  <div key={membership.workspace_id}>
                    <p className="font-medium truncate">
                      {membership.workspaces.name}
                    </p>
                    <p className="text-muted-foreground capitalize">
                      {membership.role}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
