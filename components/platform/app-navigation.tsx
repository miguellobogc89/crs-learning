"use client";

import Link from "next/link";
import {
  BookOpenText,
  ChartCandlestick,
  IceCreamBowl,
  LayoutGrid,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { APP_MODULES, type AppId } from "@/lib/platform/apps";

export const APP_ICONS: Record<AppId, LucideIcon> = {
  trading: ChartCandlestick,
  finanzas: Wallet,
  negocio: BookOpenText,
  heladeria: IceCreamBowl,
};

export function AppModuleIcon({ appId }: { appId: AppId }) {
  const Icon = APP_ICONS[appId];
  return <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />;
}

/** Navegación entre aplicaciones. Se reutiliza en las pantallas y el menú móvil. */
export function AppModuleLinks({
  activeAppId,
  onNavigate,
}: {
  activeAppId?: AppId;
  onNavigate?: () => void;
}) {
  const linkClass = "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors";

  return (
    <nav aria-label="Aplicaciones CRS" className="space-y-1">
      <Link
        href="/apps"
        onClick={onNavigate}
        aria-current={!activeAppId ? "page" : undefined}
        className={`${linkClass} ${!activeAppId ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      >
        <LayoutGrid className="size-5 shrink-0" />
        Mis aplicaciones
      </Link>
      <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Módulos</p>
      {APP_MODULES.map((app) => {
        const Icon = APP_ICONS[app.id];
        const active = activeAppId === app.id;
        return (
          <Link
            key={app.id}
            href={app.platformHref}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`${linkClass} ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.8} />
            {app.title}
          </Link>
        );
      })}
    </nav>
  );
}
