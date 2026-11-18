"use client";
// Notificaciones de Trading (17/11/2026): campana con el número de avisos sin leer y la lista.
// - móvil: la pantalla entra desde la derecha (y la de debajo se desplaza a la izquierda);
// - tablet y ordenador: panel lateral a la derecha.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleCheck, Info } from "lucide-react";
import type { listNotifications } from "@/lib/trading/notifications";
import { NotificationsDrawer } from "@/components/platform/notifications-drawer";
export { AppNotificationButton as BellButton } from "@/components/platform/notification-button";
import { api } from "./format";
import { useTradingRefresh, useWarmStart } from "./navigation";

type Data = Awaited<ReturnType<typeof listNotifications>>;
type Item = Data["items"][number];

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 24 * 60) return `hace ${Math.round(mins / 60)} h`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
};

/** Avisos y cuántos sin leer; se refrescan cada 2 minutos y con «actualizar». */
export function useNotifications() {
  const [data, setData] = useState<Data | null>(null);
  useWarmStart<Data>("notifications", setData);
  const load = useCallback(() => {
    api<Data>("notifications").then(setData).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 2 * 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  useTradingRefresh(load);
  const markRead = useCallback(async () => {
    setData((d) => (d ? { ...d, unread: 0, items: d.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) } : d));
    await api("notifications/read", {}).catch(() => undefined);
  }, []);
  return { data, load, markRead };
}

const LEVEL = {
  error: { icon: AlertTriangle, cls: "bg-red-50 text-red-600" },
  aviso: { icon: Info, cls: "bg-amber-50 text-amber-600" },
  ok: { icon: CircleCheck, cls: "bg-emerald-50 text-emerald-600" },
} as const;

function Row({ n, onNavigate }: { n: Item; onNavigate: () => void }) {
  const L = LEVEL[n.level] ?? LEVEL.aviso;
  const open = n.level !== "ok" && !n.resolvedAt;
  const body = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${L.cls}`}>
        <L.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <b className={`flex-1 text-[15px] leading-snug ${n.readAt ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</b>
          {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Sin leer" />}
        </span>
        {n.body && <span className="mt-0.5 block text-sm leading-snug text-slate-500">{n.body}</span>}
        <span className="mt-1 block text-xs text-slate-400">
          {when(n.createdAt)}
          {n.level !== "ok" && (open ? " · sigue abierto" : n.resolvedAt ? ` · resuelto ${when(n.resolvedAt)}` : "")}
        </span>
      </span>
    </>
  );
  return (
    <li className="border-b border-slate-100 last:border-0">
      {n.href ? (
        <Link href={n.href} onClick={onNavigate} className="flex gap-3 px-5 py-4 active:bg-slate-50 md:hover:bg-slate-50">
          {body}
        </Link>
      ) : (
        <div className="flex gap-3 px-5 py-4">{body}</div>
      )}
    </li>
  );
}

function List({ data, onNavigate }: { data: Data | null; onNavigate: () => void }) {
  if (!data) return <p className="px-5 py-8 text-sm text-slate-400">Cargando…</p>;
  if (!data.items.length)
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
        <CircleCheck className="h-10 w-10 text-emerald-500" />
        <b className="text-slate-800">Sin avisos</b>
        <span className="text-sm text-slate-500">Si algo deja de funcionar (FARO, los agentes, un exchange o una copia), aparecerá aquí.</span>
      </div>
    );
  return (
    <ul>
      {data.items.map((n) => (
        <Row key={n.id} n={n} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

/**
 * La pantalla de avisos. En el móvil entra desde la derecha a pantalla completa; en tablet y ordenador es
 * un panel a la derecha. Al abrirla, los avisos se marcan como leídos (los nuevos siguen marcados con el
 * punto azul mientras está abierta).
 */
export function NotificationsScreen({ open, onClose, data, markRead }: { open: boolean; onClose: () => void; data: Data | null; markRead: () => Promise<void> }) {
  const [shown, setShown] = useState<Data | null>(data);
  const wasOpen = useRef(false);
  const shownRef = useRef<Data | null>(null);
  shownRef.current = shown;
  useEffect(() => {
    if (open && !wasOpen.current) {
      // Se enseña lo que había al abrir (con sus puntos de «sin leer») y se marca como leído por detrás.
      setShown(data);
      if (data?.unread) void markRead();
    }
    if (!open) setShown(data);
    // Abierta antes de que llegaran los datos: se enseñan en cuanto llegan.
    if (open && wasOpen.current && data && !shownRef.current) setShown(data);
    wasOpen.current = open;
  }, [open, data, markRead]);
  return (
    <NotificationsDrawer open={open} onClose={onClose}>
      <List data={shown} onNavigate={onClose} />
    </NotificationsDrawer>
  );
}
