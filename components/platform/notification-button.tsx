"use client";

import { Bell } from "lucide-react";

/** Botón de notificaciones común; el origen de los avisos pertenece a cada módulo. */
export function AppNotificationButton({
  unread,
  onClick,
  className = "",
}: {
  unread: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-100 ${className}`}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
