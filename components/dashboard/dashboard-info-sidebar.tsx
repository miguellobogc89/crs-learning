// components/dashboard/dashboard-info-sidebar.tsx

import {
  Activity,
  ArrowUpRight,
  FileText,
  FolderOpen,
  HardDrive,
  Sparkles,
} from "lucide-react";

import { AppCard } from "@/components/app/layouts/app-card";

const recentActivity = [
  {
    title: "Manual de operaciones",
    description: "Documento actualizado",
    time: "Hace 12 min",
    icon: FileText,
    color: "bg-blue-50 text-blue-600",
  },
  {
    title: "Procedimientos internos",
    description: "Nueva carpeta creada",
    time: "Hace 1 h",
    icon: FolderOpen,
    color: "bg-violet-50 text-violet-600",
  },
  {
    title: "Asistente IA",
    description: "Consulta realizada",
    time: "Hace 3 h",
    icon: Sparkles,
    color: "bg-amber-50 text-amber-600",
  },
];

export function DashboardInfoSidebar() {
  return (
    <>
      <AppCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Resumen del workspace
          </h2>

          <Activity className="h-4 w-4 text-slate-400" />
        </div>

        <p className="mt-1 text-xs text-slate-400">
          Datos de demostración
        </p>

        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">
                Documentos
              </p>

              <p className="mt-0.5 text-xl font-semibold text-slate-800">
                1.248
              </p>
            </div>

            <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
              <ArrowUpRight className="h-3.5 w-3.5" />
              18 %
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <FolderOpen className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">
                Carpetas
              </p>

              <p className="mt-0.5 text-xl font-semibold text-slate-800">
                38
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <HardDrive className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">
                Almacenamiento
              </p>

              <p className="mt-0.5 text-xl font-semibold text-slate-800">
                24,6 GB
              </p>
            </div>
          </div>
        </div>
      </AppCard>

      <AppCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Actividad reciente
          </h2>

          <Activity className="h-4 w-4 text-slate-400" />
        </div>

        <p className="mt-1 text-xs text-slate-400">
          Datos de demostración
        </p>

        <div className="mt-5 space-y-5">
          {recentActivity.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className="flex items-start gap-3"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.color}`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {item.title}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {item.description}
                  </p>

                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </AppCard>
    </>
  );
}