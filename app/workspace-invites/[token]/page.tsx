import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import {
  acceptWorkspaceInviteAction,
  rejectWorkspaceInviteAction,
} from "@/app/actions/workspace-admin.actions";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { getInviteForAuthenticatedUser } from "@/lib/services/workspace-admin.service";

export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  if (!session.user.email) {
    return (
      <InviteShell title="Invitacion no disponible">
        <p className="text-sm text-muted-foreground">
          Tu sesion no tiene email asociado.
        </p>
      </InviteShell>
    );
  }

  const { token } = await params;
  const result = await getInviteForAuthenticatedUser({
    userEmail: session.user.email,
    token,
  });

  if (!result) {
    return (
      <InviteShell title="Invitacion no encontrada">
        <p className="text-sm text-muted-foreground">
          El enlace no existe o la invitacion ya no esta disponible.
        </p>
      </InviteShell>
    );
  }

  const { invite, belongsToUser, isExpired } = result;
  const isPending = invite.status === "pending";
  const canRespond = belongsToUser && isPending && !isExpired;

  return (
    <InviteShell title={invite.workspaces.name}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {invite.users.name || invite.users.email || "Un usuario"} te ha
          invitado a colaborar en este workspace como member.
        </p>

        <div className="grid gap-2 rounded-lg border border-border bg-background p-4 text-sm">
          <InfoRow label="Email invitado" value={invite.email} />
          <InfoRow label="Estado" value={invite.status} />
          <InfoRow
            label="Expira"
            value={
              invite.expires_at
                ? invite.expires_at.toLocaleDateString("es-ES")
                : "Sin expiracion"
            }
          />
        </div>

        {!belongsToUser ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Esta invitacion pertenece a otro usuario.
          </p>
        ) : null}

        {isExpired ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            Esta invitacion ha caducado.
          </p>
        ) : null}

        {!isPending ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            Esta invitacion ya fue procesada.
          </p>
        ) : null}

        {canRespond ? (
          <div className="flex flex-wrap gap-2">
            <form action={acceptWorkspaceInviteAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit">
                <Check className="mr-2 h-4 w-4" />
                Aceptar
              </Button>
            </form>

            <form action={rejectWorkspaceInviteAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="outline">
                <X className="mr-2 h-4 w-4" />
                Rechazar
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </InviteShell>
  );
}

function InviteShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </main>
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
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
