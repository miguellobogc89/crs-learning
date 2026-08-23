// components/admin/storage-stats.tsx

"use client";

"use client";

import {
  Database,
  FileText,
  HardDrive,
  UserRound,
} from "lucide-react";

import type { StorageStats } from "@/lib/repositories/admin/storage.repository";

export function StorageStats({
  stats,
}: {
  stats: StorageStats;
}) {
  function formatBytes(bytes: number): string {
    if (bytes === 0) {
      return "0 B";
    }

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];

    const index = Math.floor(
      Math.log(bytes) / Math.log(k),
    );

    return `${(
      bytes / Math.pow(k, index)
    ).toFixed(2)} ${sizes[index]}`;
  }

  const items = [
    {
      label: "Almacenamiento total",
      value: `${stats.totalStorageGB} GB`,
      detail: `${stats.totalFiles} archivos`,
      icon: HardDrive,
    },
    {
      label: "Archivos totales",
      value: stats.totalFiles.toLocaleString(),
      detail: "Documentos almacenados",
      icon: FileText,
    },
    {
      label: "Tamaño promedio",
      value: formatBytes(
        stats.averageFileSizeBytes,
      ),
      detail: "Por archivo",
      icon: Database,
    },
    {
      label: "Mayor consumidor",
      value:
        stats.topUserByStorage?.userName ||
        stats.topUserByStorage?.userEmail ||
        "—",
      detail: "Por almacenamiento",
      icon: UserRound,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-background p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {item.label}
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="min-w-0">
              <div
                className="truncate text-xl font-semibold tracking-tight text-foreground"
                title={String(item.value)}
              >
                {item.value}
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                {item.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}