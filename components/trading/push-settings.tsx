"use client";
// Notificaciones push en este móvil (22/11/2026): activar, elegir qué avisos llegan, probar y desactivar.
// En iPhone solo funcionan con la app añadida a la pantalla de inicio (iOS 16.4 o posterior).
import { useCallback, useEffect, useState } from "react";
import { BellRing, Send } from "lucide-react";
import { KIND_LABEL, type PushKind, type PushPrefs } from "@/lib/push/kinds";

type State = { publicKey: string; allowed: boolean; subscribed: boolean; prefs: PushPrefs };
type Support = "ok" | "instalar" | "no";

const SW_URL = "/trading-sw.js";
const SCOPE = "/trading/";

async function call<T>(body?: unknown, endpoint?: string | null): Promise<T> {
  const res = await fetch(`/api/trading/push${body === undefined && endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar");
  return data as T;
}

function support(): Support {
  if (typeof window === "undefined") return "no";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "instalar" : "no";
  if (ios && !standalone) return "instalar";
  return "ok";
}

const keyBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
}

export function PushSettings() {
  const [sup, setSup] = useState<Support | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = support();
    setSup(s);
    if (s !== "ok") return;
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setState(await call<State>(undefined, sub?.endpoint ?? null));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "No se pudo leer el estado");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await f();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    run(async () => {
      if (!state) return;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Sin permiso. Actívalo en Ajustes → Notificaciones → Trading.");
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.publicKey) }));
      await call({ op: "subscribe", subscription: sub.toJSON() });
      setEndpoint(sub.endpoint);
      setState({ ...state, subscribed: true });
      const t = await call<{ sent: number }>({ op: "test" });
      setNote(t.sent ? "Activadas: te acaba de llegar un aviso de prueba." : "Activadas, pero el aviso de prueba no llegó.");
    });

  const disable = () =>
    run(async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await call({ op: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => undefined);
      }
      setEndpoint(null);
      setState((s) => (s ? { ...s, subscribed: false } : s));
    });

  const toggle = (k: PushKind) =>
    run(async () => {
      if (!state || !endpoint) return;
      const prefs = { ...state.prefs, [k]: !state.prefs[k] };
      setState({ ...state, prefs });
      await call({ op: "prefs", endpoint, prefs: { [k]: prefs[k] } });
    });

  const test = () =>
    run(async () => {
      const t = await call<{ sent: number; total: number }>({ op: "test" });
      setNote(t.sent ? "Aviso de prueba enviado." : "No se pudo enviar el aviso de prueba.");
    });

  if (sup === null || sup === "no") return null;
  if (sup === "instalar")
    return (
      <div className="border-b border-slate-100 px-5 py-4 text-sm text-slate-500">
        Para recibir avisos en el móvil, añade la app a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y ábrela desde ahí.
      </div>
    );
  if (!state?.allowed) return null;
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";

  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <BellRing className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold text-slate-900">Avisos en este móvil</b>
          <span className="block text-sm text-slate-500">
            {state.subscribed ? "Activados. Te llegan aunque la app esté cerrada." : denied ? "Bloqueados en los ajustes del sistema." : "Recibe tus operaciones y los fallos aunque la app esté cerrada."}
          </span>
        </span>
        {!state.subscribed && !denied && (
          <button type="button" onClick={enable} disabled={busy} className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50">
            Activar
          </button>
        )}
      </div>
      {state.subscribed && (
        <div className="mt-3 space-y-1 pl-12">
          {(Object.keys(KIND_LABEL) as PushKind[]).map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 py-1 text-sm text-slate-700">
              <span>{KIND_LABEL[k]}</span>
              <input type="checkbox" checked={state.prefs[k]} onChange={() => toggle(k)} disabled={busy} className="h-5 w-5 accent-blue-600" />
            </label>
          ))}
          <div className="flex gap-4 pt-2 text-sm">
            <button type="button" onClick={test} disabled={busy} className="inline-flex items-center gap-1 font-medium text-blue-600 disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> Enviar prueba
            </button>
            <button type="button" onClick={disable} disabled={busy} className="font-medium text-slate-500 disabled:opacity-50">
              Desactivar
            </button>
          </div>
        </div>
      )}
      {denied && !state.subscribed && <p className="mt-2 pl-12 text-sm text-slate-500">Actívalos en Ajustes → Notificaciones → Trading y vuelve aquí.</p>}
      {note && <p className="mt-2 pl-12 text-sm text-slate-600">{note}</p>}
    </div>
  );
}
