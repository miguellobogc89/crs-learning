// app/(app)/dashboard/page.tsx

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { DashboardKnowledgeHealthCard } from "@/components/dashboard/dashboard-knowledge-health-card";
import {
  Activity,
  Brain,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  MoreVertical,
  Sparkles,
} from "lucide-react";
import { DashboardKnowledgeTable } from "@/components/dashboard/dashboard-knowledge-table";
import { auth } from "@/auth";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppCard } from "@/components/app/layouts/app-card";
import { DashboardWorkspaceSidebar } from "@/components/dashboard/dashboard-workspace-sidebar";
import {
  getDashboardOverview,
  getDashboardRecentActivity,
  type DashboardDocumentItem,
  type DashboardRecentActivityItem,
} from "@/lib/services/dashboard.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { formatShortRelativeTime } from "@/lib/utils/relative-time";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { activeWorkspace, workspaces } =
    await getActiveWorkspaceContext(
      session.user.id,
    );

  const [overview, recentActivity] =
    await Promise.all([
      getDashboardOverview({
        userId: session.user.id,
        workspaceId:
          activeWorkspace.id,
      }),

getDashboardRecentActivity({
  userId: session.user.id,
  workspaceId: activeWorkspace.id,
  limit: 10,
}),
    ]);

  return (
    <AppSectionShell
      sidebar={
        <DashboardWorkspaceSidebar
          activeWorkspaceId={
            activeWorkspace.id
          }
          userId={session.user.id}
          workspaces={workspaces}
        />
      }
    >
      <AppPageLayout contentClassName="overflow-hidden pb-4">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col">
          {/* Header */}
          <header className="flex shrink-0 items-start justify-between gap-6 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[22px] font-semibold tracking-tight text-slate-950">
                  Dashboard
                </h1>

                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[10px] text-slate-400">
                  i
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Organiza, analiza y mantén
                accesible el conocimiento de
                tu organización.
              </p>
            </div>

            <Link
              href="/knowledge"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A58FF] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              <span className="text-lg leading-none">
                +
              </span>
              Añadir conocimiento
            </Link>
          </header>

          {/* Zona superior */}
          <section className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">


  <DashboardMetricCard
    label="Documentos"
    value={formatNumber(
      overview.documentCount,
    )}
    icon={FileText}
    tone="blue"
    helper={`${formatNumber(
      overview.documentCount,
    )} disponibles`}
    chart={[
      28, 34, 30, 41, 38, 46, 43, 52,
    ]}
  />

  <DashboardMetricCard
    label="Almacenamiento"
    value={formatBytes(
      overview.storageBytes,
    )}
    icon={HardDrive}
    tone="violet"
    helper="Espacio utilizado"
    chart={[
      30, 26, 36, 32, 41, 35, 44, 38,
    ]}
  />

  <DashboardMetricCard
    label="Carpetas"
    value={formatNumber(
      overview.folderCount,
    )}
    icon={FolderOpen}
    tone="emerald"
    helper="Fuentes organizadas"
    chart={[
      22, 29, 27, 36, 31, 42, 39, 44,
    ]}
  />

  <DashboardMetricCard
    label="Analizados por IA"
    value={formatNumber(
      overview.analyzedCount,
    )}
    icon={Sparkles}
    tone="amber"
    helper={
      overview.documentCount > 0
        ? `${Math.round(
            (overview.analyzedCount /
              overview.documentCount) *
              100,
          )}% procesado`
        : "Sin documentos"
    }
    chart={[
      24, 31, 27, 40, 33, 29, 38, 45,
    ]}
  />


            </div>

<DashboardKnowledgeHealthCard
  healthy={overview.healthyPercent}
  review={overview.needsReviewPercent}
  pending={overview.pendingPercent}
/>
          </section>

          {/* Zona principal */}
          <section className="mt-4 grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_280px]">
            {/* Tabla documentos */}
            <DashboardKnowledgeTable
              documents={overview.recentDocuments}
              totalCount={overview.documentCount}
            />

{/* Columna derecha integrada */}
<div className="flex min-h-0 flex-col gap-4">
  {/* Más consultados */}
  <AppCard className="shrink-0 p-5">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-950">
        Más consultados
      </h2>

      <Link
        href="/knowledge"
        className="text-[11px] font-medium text-[#0A58FF]"
      >
        Ver todo
      </Link>
    </div>

    <div className="space-y-4">
      {overview.topDocuments.length > 0 ? (
        overview.topDocuments
          .slice(0, 3)
          .map((document) => (
            <TopDocument
              key={document.id}
              document={document}
            />
          ))
      ) : (
        <p className="text-xs leading-5 text-slate-500">
          Todavía no hay documentos para mostrar.
        </p>
      )}
    </div>
  </AppCard>

  {/* Actividad reciente */}
  <AppCard className="flex min-h-0 flex-1 flex-col p-5">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-950">
        Actividad reciente
      </h2>

      <Activity className="h-4 w-4 text-slate-400" />
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:thin]">
      {recentActivity.length > 0 ? (
        <div className="space-y-4">
          {recentActivity.map((item) => (
            <ActivityRow
              key={`${item.type}-${item.id}`}
              item={item}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs leading-5 text-slate-500">
          Todavía no hay actividad reciente.
        </p>
      )}
    </div>
  </AppCard>
</div>

          </section>
        </div>
      </AppPageLayout>
    </AppSectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Columna derecha                                                             */
/* -------------------------------------------------------------------------- */

function TopDocument({
  document,
}: {
  document: DashboardDocumentItem;
}) {
  return (
    <Link
      href={document.href}
      className="group flex min-w-0 items-center gap-3"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <FileText className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800 transition-colors group-hover:text-[#0A58FF]">
          {document.title}
        </p>

        <p className="mt-0.5 truncate text-[10px] text-slate-400">
          {document.libraryName}
        </p>
      </div>
    </Link>
  );
}

function ActivityRow({
  item,
}: {
  item: DashboardRecentActivityItem;
}) {
  return (
    <div className="flex gap-3">
      <ActivityAvatar item={item} />

      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-slate-700">
          <span className="font-medium text-slate-900">
            {item.actorName}
          </span>{" "}
          {getActivityActionLabel(
            item.type,
          )}{" "}
          {item.href ? (
            <Link
              href={item.href}
              className="font-medium text-slate-800 hover:text-[#0A58FF]"
            >
              {item.title}
            </Link>
          ) : (
            <span className="font-medium">
              {item.title}
            </span>
          )}
        </p>

        <p className="mt-1 text-[10px] text-slate-400">
          {formatShortRelativeTime(
            item.occurredAt,
          )}
        </p>
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
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[9px] font-semibold text-blue-600">
      {getInitials(item.actorName)}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Utils                                                                       */
/* -------------------------------------------------------------------------- */

function formatBytes(
  bytes: number,
) {
  if (!bytes) {
    return "0 MB";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes /
    1024 ** index;

  return `${new Intl.NumberFormat(
    "es-ES",
    {
      maximumFractionDigits:
        index >= 3 ? 1 : 0,
    },
  ).format(value)} ${units[index]}`;
}

function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat(
    "es-ES",
  ).format(value);
}

function formatDate(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function formatKnowledgeType(
  type: string,
) {
  const labels: Record<
    string,
    string
  > = {
    procedure: "Proceso",
    process: "Proceso",
    policy: "Política",
    manual: "Manual",
    guide: "Guía",
    faq: "FAQ",
    technical: "Técnico",
    functional: "Funcional",
    unknown: "Artículo",
  };

  return labels[type] ?? type;
}

function getActivityActionLabel(
  type: DashboardRecentActivityItem["type"],
) {
  if (
    type ===
    "knowledge.import.completed"
  ) {
    return "importó";
  }

  if (
    type ===
    "knowledge.file.uploaded"
  ) {
    return "subió";
  }

  if (
    type ===
    "knowledge.article.updated"
  ) {
    return "actualizó";
  }

  if (
    type ===
    "knowledge.folder.created"
  ) {
    return "creó la carpeta";
  }

  return "creó";
}

function getInitials(
  name: string,
) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]?.toUpperCase(),
    )
    .join("");
}