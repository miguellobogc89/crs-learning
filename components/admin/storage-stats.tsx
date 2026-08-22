"use client";

import type { StorageStats } from "@/lib/repositories/admin-storage.repository";
import { StatCard } from "@/components/app/stat-card";

export function StorageStats({ stats }: { stats: StorageStats }) {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={`Almacenamiento total (${stats.totalFiles} archivos)`}
        value={`${stats.totalStorageGB} GB`}
      />

      <StatCard
        title="Archivos totales"
        value={stats.totalFiles.toLocaleString()}
      />

      <StatCard
        title="Tamaño promedio"
        value={formatBytes(stats.averageFileSizeBytes)}
      />

      <StatCard
        title="Mayor consumidor"
        value={stats.topUserByStorage?.userName || stats.topUserByStorage?.userEmail || "—"}
      />
    </div>
  );
}
