import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  FileText,
  Folder,
  Layers3,
  Upload,
  UsersRound,
} from "lucide-react";

import { auth } from "@/auth";
import { AppBreadcrumb } from "@/components/ui/app-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { UserAdminEditDialog } from "@/components/users/user-admin-edit-dialog";
import {
  getUserProfileForViewer,
  type UserProfileContribution,
} from "@/lib/services/user-profile.service";
import { formatShortRelativeTime } from "@/lib/utils/relative-time";

const contributionIcons = {
  "knowledge.file.uploaded": Upload,
  "knowledge.folder.created": Folder,
  "knowledge.article.updated": Layers3,
  "knowledge.article.created": FileText,
} satisfies Record<
  UserProfileContribution["type"],
  typeof FileText
>;

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { userId } = await params;
  const profile = await getUserProfileForViewer({
    viewerUserId: session.user.id,
    profileUserId: userId,
  });

  if (!profile) {
    notFound();
  }

  const displayName =
    profile.user.name ?? profile.user.email;

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-8 py-8">
        <AppBreadcrumb
          items={[
            {
              label: "Usuarios",
              href: "/users",
              icon: UsersRound,
            },
            {
              label: displayName,
            },
          ]}
        />

        <header className="mt-6 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ProfileAvatar
              name={displayName}
              image={profile.user.image}
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                  {displayName}
                </h1>

                {profile.isCurrentUser ? (
                  <Badge variant="secondary">Tu usuario</Badge>
                ) : null}
              </div>

              <p className="mt-1 truncate text-sm text-muted-foreground">
                {profile.user.email}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {formatStatus(profile.user.status)}
                </Badge>
                <Badge variant="outline">
                  {formatSystemRole(profile.user.systemRole)}
                </Badge>
                {profile.sharedWorkspaces.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {profile.sharedWorkspaces.length} workspace
                    {profile.sharedWorkspaces.length === 1
                      ? ""
                      : "s"}{" "}
                    compartido
                    {profile.sharedWorkspaces.length === 1
                      ? ""
                      : "s"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {profile.canEdit ? (
            <UserAdminEditDialog
              user={{
                id: profile.user.id,
                email: profile.user.email,
                name: profile.user.name,
                status: profile.user.status,
                systemRole: profile.user.systemRole,
              }}
              editableSystemRoles={profile.editableSystemRoles}
            />
          ) : null}
        </header>

        <div className="mt-8 grid gap-8">
          <section>
            <SectionTitle
              title="Workspaces compartidos"
              description="Espacios donde ambos tenéis acceso activo."
            />

            {profile.sharedWorkspaces.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {profile.sharedWorkspaces.map((workspace) => (
                  <Link
                    key={workspace.id}
                    href={`/my-space/workspaces/${workspace.id}`}
                    className="rounded-lg border border-border bg-background p-4 transition-colors hover:bg-surface"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {workspace.name}
                        </h3>

                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {workspace.description ??
                            "Sin descripción."}
                        </p>
                      </div>

                      <Badge variant="outline">
                        {workspace.role}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyText text="No hay workspaces compartidos visibles." />
            )}
          </section>

          {profile.sharedTeams.length > 0 ? (
            <section>
              <SectionTitle
                title="Equipos compartidos"
                description="Equipos de Knowledge asociados a bibliotecas compartidas."
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {profile.sharedTeams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {team.name}
                    </h3>

                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {team.description ?? "Sin descripción."}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {profile.recentContributions.length > 0 ? (
            <section>
              <SectionTitle
                title="Contribución reciente a Knowledge"
                description="Cambios visibles para ti dentro de workspaces compartidos."
              />

              <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-background">
                {profile.recentContributions.map((item) => (
                  <ContributionRow
                    key={`${item.type}-${item.id}`}
                    item={item}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {profile.recentArticles.length > 0 ? (
            <section>
              <SectionTitle
                title="Artículos recientes"
                description="Artículos creados o actualizados por este usuario."
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {profile.recentArticles.map((article) => (
                  <Link
                    key={`${article.action}-${article.id}`}
                    href={article.href}
                    className="rounded-lg border border-border bg-background p-4 transition-colors hover:bg-surface"
                  >
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {article.title}
                    </h3>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {article.action === "updated"
                        ? "Actualizado"
                        : "Creado"}{" "}
                      {formatShortRelativeTime(
                        article.occurredAt,
                      ).toLowerCase()}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {profile.recentFolders.length > 0 ? (
            <section>
              <SectionTitle
                title="Carpetas recientes"
                description="Carpetas de Knowledge creadas por este usuario."
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {profile.recentFolders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={folder.href}
                    className="rounded-lg border border-border bg-background p-4 transition-colors hover:bg-surface"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                        <Folder className="h-4 w-4" />
                      </span>

                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {folder.name}
                        </h3>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Creada{" "}
                          {formatShortRelativeTime(
                            folder.occurredAt,
                          ).toLowerCase()}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ProfileAvatar({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={64}
        height={64}
        className="h-16 w-16 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-semibold text-muted-foreground">
      {getInitials(name)}
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">
        {title}
      </h2>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function ContributionRow({
  item,
}: {
  item: UserProfileContribution;
}) {
  const Icon = contributionIcons[item.type];

  return (
    <Link
      href={item.href}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {item.title}
        </span>

        <span className="mt-1 block text-xs text-muted-foreground">
          {getContributionLabel(item.type)} ·{" "}
          {formatShortRelativeTime(item.occurredAt)}
        </span>
      </span>
    </Link>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="mt-4 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function getContributionLabel(
  type: UserProfileContribution["type"],
) {
  if (type === "knowledge.file.uploaded") {
    return "Documento subido";
  }

  if (type === "knowledge.article.updated") {
    return "Artículo actualizado";
  }

  if (type === "knowledge.folder.created") {
    return "Carpeta creada";
  }

  return "Artículo creado";
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}

function formatStatus(status: string) {
  if (status === "active") {
    return "Activo";
  }

  if (status === "inactive") {
    return "Inactivo";
  }

  if (status === "suspended") {
    return "Suspendido";
  }

  return status;
}

function formatSystemRole(role: string) {
  if (role === "system_super_admin") {
    return "System Super Admin";
  }

  if (role === "system_admin") {
    return "System Admin";
  }

  return "Usuario";
}
