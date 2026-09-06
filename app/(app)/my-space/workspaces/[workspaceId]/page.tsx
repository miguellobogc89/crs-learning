import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  ShieldCheck,
  Trash2,
  UserMinus,
  UsersRound,
} from "lucide-react";

import {
  cancelWorkspaceInviteAction,
  deleteWorkspaceAction,
  leaveWorkspaceAction,
  removeWorkspaceMemberAction,
  updateWorkspaceGeneralAction,
  updateWorkspaceMemberRoleAction,
} from "@/app/actions/workspace-admin.actions";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceInviteForm } from "@/components/workspace/workspace-invite-form";
import { getWorkspaceAdminDetail } from "@/lib/services/workspace-admin.service";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { workspaceId } = await params;
  const detail = await getWorkspaceAdminDetail({
    userId: session.user.id,
    workspaceId,
  });

  if (!detail) {
    notFound();
  }

  const isOwner = detail.role === "owner";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my-space/workspaces">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Workspaces
            </Link>
          </Button>
        </div>

        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {detail.workspace.name}
              </h1>
              <Badge variant={isOwner ? "default" : "outline"}>
                {isOwner ? "Propio" : "Compartido"}
              </Badge>
              <Badge variant="secondary">{detail.role}</Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {detail.workspace.description || "Sin descripcion."}
            </p>
          </div>
        </header>

        <div className="grid gap-6">
          <section className="rounded-lg border border-border bg-card p-6">
            <SectionTitle
              icon={<ShieldCheck className="h-4 w-4" />}
              title="General"
            />

            {isOwner ? (
              <form
                action={updateWorkspaceGeneralAction}
                className="mt-5 grid gap-4"
              >
                <input
                  type="hidden"
                  name="workspaceId"
                  value={detail.workspace.id}
                />

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Nombre</span>
                  <input
                    name="name"
                    defaultValue={detail.workspace.name}
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 outline-none"
                  />
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Descripcion</span>
                  <textarea
                    name="description"
                    defaultValue={detail.workspace.description ?? ""}
                    rows={3}
                    className="rounded-lg border border-border bg-background px-3 py-2 outline-none"
                  />
                </label>

                <div>
                  <Button type="submit">Guardar cambios</Button>
                </div>
              </form>
            ) : (
              <div className="mt-5 grid gap-3 text-sm">
                <InfoRow label="Nombre" value={detail.workspace.name} />
                <InfoRow
                  label="Descripcion"
                  value={detail.workspace.description || "Sin descripcion"}
                />
                <InfoRow label="Estado" value={detail.workspace.status} />
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <SectionTitle
              icon={<UsersRound className="h-4 w-4" />}
              title="Miembros"
            />

            {isOwner ? (
              <WorkspaceInviteForm
                workspaceId={detail.workspace.id}
              />
            ) : null}

            <div className="mt-5 divide-y divide-border rounded-lg border border-border">
              {detail.members.map((member) => {
                const isWorkspaceOwner =
                  member.user_id === detail.workspace.owner_user_id;

                return (
                  <div
                    key={member.id}
                    className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">
                          {member.users.name || member.users.email}
                        </p>
                        <Badge variant="outline">{member.role}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {member.users.email}
                      </p>
                    </div>

                    {isOwner && !isWorkspaceOwner ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={updateWorkspaceMemberRoleAction}>
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={detail.workspace.id}
                          />
                          <input
                            type="hidden"
                            name="memberId"
                            value={member.id}
                          />
                          <input type="hidden" name="role" value="member" />
                          <Button type="submit" variant="outline" size="sm">
                            Rol member
                          </Button>
                        </form>

                        <form action={removeWorkspaceMemberAction}>
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={detail.workspace.id}
                          />
                          <input
                            type="hidden"
                            name="memberId"
                            value={member.id}
                          />
                          <Button type="submit" variant="destructive" size="sm">
                            <UserMinus className="mr-2 h-4 w-4" />
                            Eliminar
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {isOwner ? (
            <section className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<Mail className="h-4 w-4" />}
                title="Invitaciones pendientes"
              />

              <div className="mt-5 divide-y divide-border rounded-lg border border-border">
                {detail.invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Expira:{" "}
                        {invite.expires_at
                          ? invite.expires_at.toLocaleDateString("es-ES")
                          : "Sin expiracion"}
                      </p>
                    </div>

                    <form action={cancelWorkspaceInviteAction}>
                      <input
                        type="hidden"
                        name="workspaceId"
                        value={detail.workspace.id}
                      />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Cancelar
                      </Button>
                    </form>
                  </div>
                ))}

                {detail.invites.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No hay invitaciones pendientes.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-destructive/30 bg-card p-6">
            <SectionTitle
              icon={<Trash2 className="h-4 w-4" />}
              title="Zona de peligro"
            />

            {isOwner ? (
              <form action={deleteWorkspaceAction} className="mt-5 grid gap-3">
                <input
                  type="hidden"
                  name="workspaceId"
                  value={detail.workspace.id}
                />
                <p className="text-sm text-muted-foreground">
                  Eliminar este workspace borra sus bibliotecas y articulos de
                  Knowledge asociados. Escribe el nombre exacto para confirmar.
                </p>
                <input
                  name="confirmation"
                  placeholder={detail.workspace.name}
                  required
                  className="max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                />
                <div>
                  <Button type="submit" variant="destructive">
                    Eliminar workspace
                  </Button>
                </div>
              </form>
            ) : (
              <form action={leaveWorkspaceAction} className="mt-5">
                <input
                  type="hidden"
                  name="workspaceId"
                  value={detail.workspace.id}
                />
                <Button type="submit" variant="destructive">
                  Abandonar workspace
                </Button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted-foreground">
        {icon}
      </span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-background p-3">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}
