// components/home/overview/home-overview-aside.tsx

import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  FileText,
} from "lucide-react";

import { DashboardKnowledgeHealthCard } from "@/components/dashboard/dashboard-knowledge-health-card";
import type {
  DashboardDocumentItem,
  DashboardRecentActivityItem,
} from "@/lib/services/dashboard.service";
import { formatShortRelativeTime } from "@/lib/utils/relative-time";

type Props = {
  healthyPercent: number;
  needsReviewPercent: number;
  pendingPercent: number;
  topDocuments: DashboardDocumentItem[];
  recentActivity: DashboardRecentActivityItem[];
};

export function HomeOverviewAside({
  healthyPercent,
  needsReviewPercent,
  pendingPercent,
  topDocuments,
  recentActivity,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]">
      <div className="shrink-0">
        <DashboardKnowledgeHealthCard
          healthy={healthyPercent}
          review={needsReviewPercent}
          pending={pendingPercent}
        />
      </div>

      <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-950">
            Más consultados
          </h2>

          <Link
            href="/knowledge"
            className="text-[11px] font-medium text-[#0A58FF] hover:underline"
          >
            Ver todo
          </Link>
        </div>

        <div className="space-y-4">
          {topDocuments.length > 0 ? (
            topDocuments
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
      </section>

      <section className="flex min-h-[220px] flex-1 flex-col rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-950">
            Actividad reciente
          </h2>

          <Activity className="h-4 w-4 text-slate-400" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {recentActivity.length > 0 ? (
            <div className="space-y-4">
              {recentActivity
                .slice(0, 5)
                .map((item) => (
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
      </section>
    </div>
  );
}

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
            <span className="font-medium text-slate-800">
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

function getInitials(name: string) {
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