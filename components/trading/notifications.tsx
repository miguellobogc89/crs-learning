"use client";
// Notificaciones de Trading (17/11/2026): campana con el número de avisos sin leer y la lista.
// - móvil: la pantalla entra desde la derecha (y la de debajo se desplaza a la izquierda);
// - tablet y ordenador: panel lateral a la derecha.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, CircleCheck, Info, X } from "lucide-react";
import type { listNotifications } from "@/lib/trading/notifications";
import { MobileAppHeader } from "@/components/platform/mobile-app-header";
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

export function BellButton({ unread, onClick, className = "" }: { unread: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-100 ${className}`}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
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
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <>
      {/* Fondo oscuro solo en tablet y ordenador. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 hidden bg-slate-900/20 transition-opacity duration-300 md:block ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notificaciones"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-300 ease-out md:max-w-md ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <MobileAppHeader
          primary={false}
          onBackClick={onClose}
          title="Notificaciones"
          right={<Bell className="size-5 text-slate-500" aria-hidden="true" />}
        />
        <header className="hidden h-14 shrink-0 items-center justify-between border-b border-slate-200/70 px-4 md:flex">
          <h2 className="text-[17px] font-semibold text-slate-900">Notificaciones</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          <List data={shown} onNavigate={onClose} />
        </div>
      </aside>
    </>
  );
}
