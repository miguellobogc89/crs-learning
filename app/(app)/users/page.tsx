import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Search,
  UsersRound,
} from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listVisibleUsersForViewer,
  type VisibleUserDirectoryItem,
} from "@/lib/services/user-profile.service";

export default async function UsersDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams =
    await searchParams;
  const query = resolvedSearchParams?.q ?? "";
  const users = await listVisibleUsersForViewer({
    viewerUserId: session.user.id,
    query,
    limit: 80,
  });

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <header className="border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-muted-foreground">
              <UsersRound className="h-5 w-5" />
            </span>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Usuarios
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Directorio interno de usuarios visibles para ti.
              </p>
            </div>
          </div>
        </header>

        <form
          action="/users"
          className="mt-6 flex max-w-xl items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Buscar por nombre o email"
              className="pl-8"
            />
          </div>

          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        <section className="mt-6 overflow-hidden rounded-lg border border-border bg-background">
          {users.length > 0 ? (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <UserDirectoryRow
                  key={user.id}
                  user={user}
                />
              ))}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm font-medium text-foreground">
                No hay usuarios visibles
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Los usuarios apareceran aqui cuando compartan contigo un workspace activo.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function UserDirectoryRow({
  user,
}: {
  user: VisibleUserDirectoryItem;
}) {
  const displayName = user.name ?? user.email;

  return (
    <Link
      href={`/users/${user.id}`}
      className="grid gap-4 px-4 py-4 transition-colors hover:bg-surface md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar
          name={displayName}
          image={user.image}
        />

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>

            {user.isCurrentUser ? (
              <Badge variant="secondary">Tu usuario</Badge>
            ) : null}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
        </div>
      </div>

      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Rol
        </p>
        <p className="mt-1 truncate text-foreground">
          {formatRole(user.primaryRole)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Workspaces
        </p>
        <p className="mt-1 truncate text-sm text-foreground">
          {user.sharedWorkspaces.length > 0
            ? user.sharedWorkspaces
                .map((workspace) => workspace.name)
                .join(", ")
            : "Sin workspace compartido"}
        </p>
        {user.sharedTeams.length > 0 ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {user.sharedTeams
              .map((team) => team.name)
              .join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <Badge variant="outline">
          {formatStatus(user.status)}
        </Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function UserAvatar({
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
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted-foreground">
      {getInitials(name)}
    </span>
  );
}

function formatRole(role: string) {
  if (role === "system_super_admin") {
    return "System Super Admin";
  }

  if (role === "system_admin") {
    return "System Admin";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
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

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}
