// components/admin/admin-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Database,
  FileText,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

const adminSidebarItems = [
  {
    href: "/admin/users",
    icon: FileText,
    label: "Usuarios",
  },
  {
    href: "/admin/storage",
    icon: Database,
    label: "Almacenamiento",
  },
  {
    href: "/admin/ai-usage",
    icon: Zap,
    label: "Uso de IA",
    disabled: true,
  },
  {
    href: "/admin/activity",
    icon: Activity,
    label: "Actividad",
    disabled: true,
  },
  {
    href: "/admin/errors",
    icon: AlertTriangle,
    label: "Errores",
    disabled: true,
  },
  {
    href: "/admin/system",
    icon: Database,
    label: "Sistema",
    disabled: true,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-panel">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-4">
          <p className="mb-4 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Administración
          </p>

          <nav className="space-y-1">
            {adminSidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const isDisabled = item.disabled;

              return (
                <Link
                  key={item.href}
                  href={isDisabled ? "#" : item.href}
                  aria-disabled={isDisabled}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-surface text-foreground"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    isDisabled &&
                      "pointer-events-none cursor-not-allowed opacity-50",
                  )}
                  onClick={(e) => {
                    if (isDisabled) {
                      e.preventDefault();
                    }
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">
                    {item.label}
                  </span>
                  {isDisabled && (
                    <span className="text-[10px] text-muted-foreground">
                      Próximamente
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}
