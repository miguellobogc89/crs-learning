// components/home/overview/home-stats.tsx

import {
  FileText,
  FolderOpen,
  HardDrive,
  Sparkles,
} from "lucide-react";

import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";

type Props = {
  documentCount: number;
  storageBytes: number;
  folderCount: number;
  analyzedCount: number;
};

export function HomeStats({
  documentCount,
  storageBytes,
  folderCount,
  analyzedCount,
}: Props) {
  const analyzedPercent =
    documentCount > 0
      ? Math.round(
          (analyzedCount /
            documentCount) *
            100,
        )
      : 0;

  return (
    <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <DashboardMetricCard
        label="Documentos"
        value={formatNumber(documentCount)}
        icon={FileText}
        tone="blue"
        helper={`${formatNumber(
          documentCount,
        )} disponibles`}
        chart={[
          28, 34, 30, 41,
          38, 46, 43, 52,
        ]}
      />

      <DashboardMetricCard
        label="Almacenamiento"
        value={formatBytes(storageBytes)}
        icon={HardDrive}
        tone="violet"
        helper="Espacio utilizado"
        chart={[
          30, 26, 36, 32,
          41, 35, 44, 38,
        ]}
      />

      <DashboardMetricCard
        label="Carpetas"
        value={formatNumber(folderCount)}
        icon={FolderOpen}
        tone="emerald"
        helper="Fuentes organizadas"
        chart={[
          22, 29, 27, 36,
          31, 42, 39, 44,
        ]}
      />

      <DashboardMetricCard
        label="Analizados por IA"
        value={formatNumber(analyzedCount)}
        icon={Sparkles}
        tone="amber"
        helper={
          documentCount > 0
            ? `${analyzedPercent}% procesado`
            : "Sin documentos"
        }
        chart={[
          24, 31, 27, 40,
          33, 29, 38, 45,
        ]}
      />
    </section>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(
    "es-ES",
  ).format(value);
}

function formatBytes(bytes: number) {
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
    bytes / 1024 ** index;

  return `${new Intl.NumberFormat(
    "es-ES",
    {
      maximumFractionDigits:
        index >= 3 ? 1 : 0,
    },
  ).format(value)} ${units[index]}`;
}