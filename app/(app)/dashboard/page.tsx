// app/(app)/dashboard/page.tsx

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Brain,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  HardDrive,
  Inbox,
  MessageSquareText,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { auth } from "@/auth";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppCard } from "@/components/app/layouts/app-card";
import { FirstSteps } from "@/components/dashboard/first-steps";
import { DashboardWorkspaceSidebar } from "@/components/dashboard/dashboard-workspace-sidebar";
import { DashboardInfoSidebar } from "@/components/dashboard/dashboard-info-sidebar";
import {
  getContinueWorkingItems,
  getDashboardFirstSteps,
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

const workspaceMetrics = [
  {
    label: "Documentos",
    value: "1.248",
    icon: FileText,
    iconClassName: "bg-blue-50 text-blue-600",
  },
  {
    label: "Carpetas",
    value: "38",
    icon: FolderOpen,
    iconClassName: "bg-violet-50 text-violet-600",
  },
  {
    label: "Almacenamiento",
    value: "24,6 GB",
    icon: HardDrive,
    iconClassName: "bg-emerald-50 text-emerald-600",
  },
  {
    label: "Actividad IA",
    value: "—",
    icon: Sparkles,
    iconClassName: "bg-amber-50 text-amber-600",
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

  const [
    onboarding,
    continueWorkingItems,
    recentActivity,
  ] = await Promise.all([
    getDashboardFirstSteps({
      userId: session.user.id,
      workspaceId: activeWorkspace.id,
      workspaceCount: workspaces.length,
    }),
    getContinueWorkingItems({
      userId: session.user.id,
      workspaceId: activeWorkspace.id,
      limit: 20,
    }),
    getDashboardRecentActivity({
      userId: session.user.id,
      workspaceId: activeWorkspace.id,
      limit: 20,
    }),
  ]);

  const firstName = session.user.name
    ? session.user.name.split(" ")[0]
    : null;

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
      <AppPageLayout aside={<DashboardInfoSidebar />}>
        {/* Cabecera */}
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bienvenido{firstName ? `, ${firstName}` : ""}
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Aquí tienes un resumen de tu espacio de trabajo.
          </p>
        </header>

        {/* Métricas principales */}
        <section className="mt-6">
          <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
            {workspaceMetrics.map((metric) => {
              const Icon = metric.icon;

              return (
                <AppCard
                  key={metric.label}
                  className="min-w-0 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        metric.iconClassName,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  <p className="mt-5 text-xs font-medium text-muted-foreground">
                    {metric.label}
                  </p>

                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    {metric.value}
                  </p>
                </AppCard>
              );
            })}
          </div>
        </section>

        {/* Primeros pasos */}
        <section className="mt-6">
          <FirstSteps onboarding={onboarding} />
        </section>

        {/* Accesos rápidos */}
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Accesos rápidos
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Entra directamente en las áreas que más utilizas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
            {quickAccessItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className="
                    group flex min-h-[88px] min-w-0 items-center gap-3
                    rounded-2xl border border-slate-200 bg-white px-4 py-4
                    transition-all
                    hover:border-blue-200
                    hover:shadow-[0_8px_24px_rgba(37,99,235,0.08)]
                    focus-visible:outline-2
                    focus-visible:outline-offset-2
                    focus-visible:outline-brand
                  "
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {item.title}
                    </h3>

                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              );
            })}

            <div
              className="
                flex min-h-[88px] min-w-0 items-center gap-3
                rounded-2xl border border-slate-200 bg-white px-4 py-4
              "
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Bot className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Agentes
                  </h3>

                  <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
                    Próximamente
                  </span>
                </div>

                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  Automatiza tareas y procesos
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Zona principal */}
        <section className="mt-8 grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.75fr)]">
          {/* Continuar trabajando */}
          <div className="min-w-0">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Continuar trabajando
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Vuelve rápidamente a lo último en lo que estabas trabajando.
              </p>
            </div>

            <AppCard className="overflow-hidden p-0">
              {continueWorkingItems.length > 0 ? (
                <div className="max-h-[360px] overflow-y-auto">
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
                <div className="min-h-28 px-6 py-6">
                  <h3 className="text-sm font-semibold text-foreground">
                    Todavía no tienes actividad reciente
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Los artículos, cursos y conversaciones que utilices
                    aparecerán aquí.
                  </p>
                </div>
              )}
            </AppCard>
          </div>

          {/* Actividad reciente */}
          <div className="min-w-0">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Actividad reciente
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Últimos cambios realizados en este espacio.
              </p>
            </div>

            <AppCard className="p-5">
              {recentActivity.length > 0 ? (
                <div className="max-h-[360px] space-y-5 overflow-y-auto pr-2">
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
            </AppCard>
          </div>
        </section>
      </AppPageLayout>
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
        "group flex min-h-20 items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50",
        !isLast && "border-b border-border/60",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          item.resourceType === "knowledge_source"
            ? "bg-blue-50 text-blue-600"
            : "bg-slate-50 text-muted-foreground",
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

            <div className="hidden h-1 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
              <div
                className="h-full rounded-full bg-[#0A58FF]"
                style={{
                  width: `${item.progressPercent}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-1 truncate text-xs text-muted-foreground">
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

  const Icon =
    continueWorkingIcons[item.resourceType];

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
        className="h-8 w-8 shrink-0 rounded-full transition-colors hover:text-[#0A58FF]"
        aria-label={`Ver perfil de ${item.actorName}`}
      >
        <ActivityAvatar item={item} />
      </Link>

      <div className="min-w-0">
        <p className="text-sm leading-5 text-foreground">
          <Link
            href={`/users/${item.actorUserId}`}
            className="font-medium transition-colors hover:text-[#0A58FF]"
          >
            {item.actorName}
          </Link>{" "}
          <span className="text-muted-foreground">
            {getActivityActionLabel(item.type)}
          </span>{" "}
          {item.href ? (
            <Link
              href={item.href}
              className="font-medium transition-colors hover:text-[#0A58FF]"
            >
              {item.title}
            </Link>
          ) : (
            <span className="font-medium">
              {item.title}
            </span>
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
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-medium text-muted-foreground">
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