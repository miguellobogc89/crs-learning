//app/(app)/dashboard/page.tsx

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Brain,
  Clock3,
  FileText,
  GraduationCap,
  Inbox,
  MessageSquareText,
  UsersRound,
} from "lucide-react";

import { auth } from "@/auth";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { DashboardWorkspaceSidebar } from "@/components/dashboard/dashboard-workspace-sidebar";
import {
  getContinueWorkingItems,
  getDashboardRecentActivity,
  type ContinueWorkingItem,
  type DashboardRecentActivityItem,
} from "@/lib/services/dashboard.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { cn } from "@/lib/utils";
import { formatShortRelativeTime } from "@/lib/utils/relative-time";

const quickAccessItems = [
  {
    title: "Knowledge",
    description: "Consulta y organiza el conocimiento",
    href: "/knowledge",
    icon: Brain,
  },
  {
    title: "Asistente",
    description: "Pregunta y trabaja con tu conocimiento",
    href: "/assistant",
    icon: MessageSquareText,
  },
  {
    title: "Bandeja",
    description: "Revisa tus notificaciones y novedades",
    href: "/notifications",
    icon: Inbox,
  },
  {
    title: "Equipos",
    description: "Gestiona tus espacios y colaboradores",
    href: "/my-space/workspaces",
    icon: UsersRound,
  },
];

type LucideContinueWorkingResourceType = Exclude<
  ContinueWorkingItem["resourceType"],
  "knowledge_library"
>;

const continueWorkingIcons = {
  knowledge_source: FileText,
  chat_conversation: MessageSquareText,
  course: GraduationCap,
} satisfies Record<
  LucideContinueWorkingResourceType,
  typeof FileText
>;

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { activeWorkspace, workspaces } =
    await getActiveWorkspaceContext(session.user.id);
  const continueWorkingItems =
    await getContinueWorkingItems({
      userId: session.user.id,
      workspaceId: activeWorkspace.id,
      limit: 20,
    });
const recentActivity =
  await getDashboardRecentActivity({
    userId: session.user.id,
    workspaceId: activeWorkspace.id,
    limit: 20,
  });

  return (
    <AppSectionShell
      sidebar={
        <DashboardWorkspaceSidebar
          activeWorkspaceId={activeWorkspace.id}
          userId={session.user.id}
          workspaces={workspaces}
        />
      }
    >
      <main className="h-full overflow-y-auto bg-background">
        <div className="mx-auto max-w-6xl px-8 py-10">
<header>
  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
    Bienvenido{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}
  </h1>
</header>

          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Accesos rápidos
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Entra directamente en las áreas que más utilizas.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {quickAccessItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="group flex min-h-40 flex-col rounded-xl border border-border bg-background p-5 transition-colors hover:bg-surface"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand-soft-hover">
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-foreground">
                          {item.title}
                        </h3>

                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </div>

                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                );
              })}

              <div className="flex min-h-40 flex-col rounded-xl border border-border bg-background p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Bot className="h-4 w-4" />
                  </div>

                  <span className="rounded-md bg-brand-soft px-2 py-1 text-[10px] font-medium text-brand">
                    Próximamente
                  </span>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-foreground">
                    Agentes
                  </h3>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Automatiza tareas y procesos con agentes personalizados
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-12 grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)]">
            <section>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Continuar trabajando
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Vuelve rápidamente a lo último en lo que estabas trabajando.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-background">
                {continueWorkingItems.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto">
                    {continueWorkingItems.map((item, index) => (
                      <ContinueWorkingRow
                        key={`${item.resourceType}-${item.resourceId}`}
                        item={item}
                        isLast={
                          index === continueWorkingItems.length - 1
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="min-h-24 px-5 py-5">
                    <h3 className="text-sm font-semibold text-foreground">
                      Todavía no tienes actividad reciente
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Los artículos, cursos y conversaciones que utilices
                      aparecerán aquí.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside>
              <section>
                <div className="mb-5">
                  <h2 className="text-sm font-semibold text-foreground">
                    Actividad reciente
                  </h2>
                </div>

                {recentActivity.length > 0 ? (
                  <div className="max-h-96 space-y-5 overflow-y-auto pr-2">
                    {recentActivity.map((item) => (
                      <RecentActivityRow
                        key={`${item.type}-${item.id}`}
                        item={item}
                      />
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Todavía no hay actividad reciente
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Los cambios realizados en este espacio aparecerán aquí.
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </main>
    </AppSectionShell>
  );
}

function ContinueWorkingRow({
  item,
  isLast,
}: {
  item: ContinueWorkingItem;
  isLast: boolean;
}) {
  const showProgress =
    item.resourceType === "course" &&
    typeof item.progressPercent === "number";

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-surface",
        !isLast && "border-b border-border",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          item.resourceType === "knowledge_source"
            ? "bg-brand-soft text-brand"
            : "bg-surface text-muted-foreground",
        )}
      >
        <ContinueWorkingIcon item={item} />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {item.title}
        </h3>

        {showProgress ? (
          <div className="mt-1 flex items-center gap-3">
            <p className="shrink-0 text-xs text-muted-foreground">
              {item.subtitle}
            </p>

            <div className="hidden h-1 w-24 overflow-hidden rounded-full bg-surface sm:block">
              <div
                className="h-full rounded-full bg-brand"
                style={{
                  width: `${item.progressPercent}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.subtitle}
          </p>
        )}
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function ContinueWorkingIcon({
  item,
}: {
  item: ContinueWorkingItem;
}) {
  if (item.resourceType === "knowledge_library") {
    return (
      <Image
        src="/icons/files/folder.png"
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 object-contain"
      />
    );
  }

  const Icon = continueWorkingIcons[item.resourceType];

  return <Icon className="h-4 w-4" />;
}

function RecentActivityRow({
  item,
}: {
  item: DashboardRecentActivityItem;
}) {
  return (
    <div className="flex gap-3">
      <Link
        href={`/users/${item.actorUserId}`}
        className="h-8 w-8 shrink-0 rounded-full transition-colors hover:text-brand"
        aria-label={`Ver perfil de ${item.actorName}`}
      >
        <ActivityAvatar item={item} />
      </Link>

      <div className="min-w-0">
        <p className="text-sm leading-5 text-foreground">
          <Link
            href={`/users/${item.actorUserId}`}
            className="font-medium transition-colors hover:text-brand"
          >
            {item.actorName}
          </Link>{" "}
          <span className="text-muted-foreground">
            {getActivityActionLabel(item.type)}
          </span>{" "}
          {item.href ? (
            <Link
              href={item.href}
              className="font-medium transition-colors hover:text-brand"
            >
              {item.title}
            </Link>
          ) : (
            <span className="font-medium">{item.title}</span>
          )}
        </p>

        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          {formatShortRelativeTime(item.occurredAt)}
        </div>
      </div>
    </div>
  );
}

function ActivityAvatar({
  item,
}: {
  item: DashboardRecentActivityItem;
}) {
  if (item.actorImage) {
    return (
      <Image
        src={item.actorImage}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-medium text-muted-foreground">
      {getInitials(item.actorName)}
    </div>
  );
}

function getActivityActionLabel(
  type: DashboardRecentActivityItem["type"],
) {
  if (type === "knowledge.import.completed") {
    return "importó";
  }

  if (type === "knowledge.file.uploaded") {
    return "subió";
  }

  if (type === "knowledge.article.updated") {
    return "actualizó";
  }

  if (type === "knowledge.folder.created") {
    return "creó la carpeta";
  }

  return "creó";
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
