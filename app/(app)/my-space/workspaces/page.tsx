import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, UsersRound } from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listWorkspaceAdminItems } from "@/lib/services/workspace-admin.service";

export default async function WorkspacesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const workspaces = await listWorkspaceAdminItems(session.user.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Workspaces
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Administra tus espacios personales y los workspaces compartidos a
              los que tienes acceso.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {workspaces.map((workspace) => {
            const isOwner = workspace.role === "owner";

            return (
              <article
                key={workspace.id}
                className="rounded-lg border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">
                        {workspace.name}
                      </h2>
                      <Badge variant={isOwner ? "default" : "outline"}>
                        {isOwner ? "Propio" : "Compartido"}
                      </Badge>
                      <Badge variant="secondary">{workspace.role}</Badge>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {workspace.description || "Sin descripcion."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <UsersRound className="h-4 w-4" />
                        {workspace.member_count ?? 0} miembros
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4" />
                        {workspace.status ?? "active"}
                      </span>
                    </div>
                  </div>

                  <Button asChild variant="outline">
                    <Link href={`/my-space/workspaces/${workspace.id}`}>
                      Gestionar
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        {workspaces.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Todavia no tienes workspaces disponibles.
          </div>
        ) : null}
      </div>
    </div>
  );
}
