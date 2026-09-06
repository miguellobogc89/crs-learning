// components/settings/settings-shell.tsx

import Link from "next/link";

import { AppSectionShell } from "@/components/app/section-sidebar";

export function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppSectionShell sidebar={<SettingsSidebar />}>
      {children}
    </AppSectionShell>
  );
}

function SettingsSidebar() {
  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Configuración
        </p>

        <nav className="space-y-1">
          <Link
            href="/settings"
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            General
          </Link>

          <Link
            href="/settings/plans"
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            Plan y facturación
          </Link>

          <div
            aria-disabled="true"
            className="flex w-full cursor-default items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/40"
          >
            <span>Notificaciones</span>

            <span className="text-[10px]">
              Próximamente
            </span>
          </div>
        </nav>
      </div>
    </div>
  );
}