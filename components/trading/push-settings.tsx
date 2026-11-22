"use client";
// Ajustes → Notificaciones (22/11/2026): activar los avisos en este móvil, elegir cuáles llegan, probar y desactivar.
// En iPhone solo funcionan con la app añadida a la pantalla de inicio (iOS 16.4 o posterior).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronRight, Send, Smartphone } from "lucide-react";
import { KIND_LABEL, type PushKind, type PushPrefs } from "@/lib/push/kinds";
import { card, ghost, primary } from "./format";

type State = { publicKey: string; allowed: boolean; subscribed: boolean; prefs: PushPrefs };
type Support = "ok" | "instalar" | "no";

const SW_URL = "/trading-sw.js";
const SCOPE = "/trading/";

const SECTIONS: { title: string; kinds: { k: PushKind; help: string }[] }[] = [
  {
    title: "Operaciones",
    kinds: [
      { k: "trades", help: "Cada compra y cada venta con dinero real: las tuyas y las de los agentes que copias." },
      { k: "stops", help: "Cuando el stop de una operación se mueve un 1 % o más, o pasa a asegurar beneficio. Pueden ser varios al día." },
    ],
  },
  {
    title: "Sistema",
    kinds: [{ k: "health", help: "Si FARO deja de analizar, los agentes no se revisan, un exchange no responde o una copia falla, y cuando se arregla." }],
  },
];

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
  if (ios && !standalone) return "instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "no";
  return "ok";
}

const keyBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
}

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-blue-600" : "bg-slate-200"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Enlace a los ajustes desde la campana. */
export function PushSettingsLink({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link href="/trading/notificaciones" onClick={onNavigate} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm text-slate-600 active:bg-slate-50 md:hover:bg-slate-50">
      <BellRing className="h-4 w-4 text-blue-600" />
      <span className="flex-1">Avisos en el móvil</span>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

export function PushSettingsPanel() {
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
      if (perm !== "granted") throw new Error("Sin permiso. Actívalo en los ajustes del móvil (Notificaciones → Trading).");
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.publicKey) }));
      await call({ op: "subscribe", subscription: sub.toJSON() });
      setEndpoint(sub.endpoint);
      setState({ ...state, subscribed: true });
      const t = await call<{ sent: number }>({ op: "test" });
      setNote(t.sent ? "Activados: te acaba de llegar un aviso de prueba." : "Activados, pero el aviso de prueba no llegó.");
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
      const t = await call<{ sent: number }>({ op: "test" });
      setNote(t.sent ? "Aviso de prueba enviado." : "No se pudo enviar el aviso de prueba.");
    });

  if (sup === null || (sup === "ok" && !state && !note)) return <div className={`${card} p-5 text-sm text-slate-400`}>Cargando…</div>;

  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  const on = !!state?.subscribed;
  let status: string;
  if (sup === "instalar") status = "Para recibir avisos en el iPhone, añade la app a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y ábrela desde ahí.";
  else if (sup === "no") status = "Este navegador no admite notificaciones push.";
  else if (state && !state.allowed) status = "Los avisos de Trading son de las cuentas con dinero real y solo llegan a los administradores.";
  else if (on) status = "Activados. Te llegan aunque la app esté cerrada.";
  else if (denied) status = "Bloqueados en los ajustes del móvil: actívalos en Notificaciones → Trading y vuelve aquí.";
  else status = "Recibe tus operaciones y los fallos aunque la app esté cerrada.";
  const canEnable = sup === "ok" && !!state?.allowed && !on && !denied;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Este dispositivo</h2>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${on ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
              <Smartphone className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-semibold text-slate-900">Notificaciones push</b>
              <span className="block text-sm text-slate-500">{status}</span>
            </span>
          </div>
          {(canEnable || on) && (
            <div className="mt-4 flex flex-wrap gap-2 pl-[52px]">
              {canEnable && (
                <button type="button" onClick={enable} disabled={busy} className={primary}>
                  Activar en este móvil
                </button>
              )}
              {on && (
                <>
                  <button type="button" onClick={test} disabled={busy} className={ghost}>
                    <Send className="h-4 w-4" /> Enviar prueba
                  </button>
                  <button type="button" onClick={disable} disabled={busy} className={ghost}>
                    Desactivar
                  </button>
                </>
              )}
            </div>
          )}
          {note && <p className="mt-3 pl-[52px] text-sm text-slate-600">{note}</p>}
        </div>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.title}</h2>
          <ul className={`${card} divide-y divide-slate-100`}>
            {s.kinds.map(({ k, help }) => (
              <li key={k} className="flex items-center gap-4 p-4">
                <span className="min-w-0 flex-1">
                  <b className="block text-[15px] font-medium text-slate-900">{KIND_LABEL[k]}</b>
                  <span className="block text-sm text-slate-500">{help}</span>
                </span>
                <Switch on={on && !!state?.prefs[k]} disabled={!on || busy} onChange={() => toggle(k)} label={KIND_LABEL[k]} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="px-1 text-xs text-slate-400">Lo que elijas vale para este móvil. Todos los avisos siguen apareciendo en la campana.</p>
    </div>
  );
}
