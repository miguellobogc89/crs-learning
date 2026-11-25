"use client";
// Deslizar entre meses en Inicio (25/11/2026). Dos zonas: el aro y el desglose de debajo.
// - Arrastras el aro: el aro se desliza con el dedo e imanta; el desglose se desvanece y aparece el del mes nuevo.
// - Arrastras el desglose: el desglose se va con el dedo y entra el nuevo; el aro se desvanece y vuelve en el mes nuevo.
// El gesto cuenta como horizontal con bastante inclinación (hasta ~60°), no solo si es casi plano: lo vertical sigue
// siendo el scroll de la página. Todo el movimiento va directo al DOM para no repintar las listas a cada píxel.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Region = "arc" | "list";
const ARC_T = "transform 320ms cubic-bezier(.2,.8,.2,1)";
const FADE = 150;

export function useMonthSwipe(page: number, setPage: (p: number) => void, count: number, ready: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const arcTrack = useRef<HTMLDivElement>(null);
  const arcFade = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(page);
  const jump = useRef(false);
  const busy = useRef(false);
  const st = useRef({ page, count });
  st.current = { page, count };

  // El aro sigue a «page»: deslizándose, o de golpe si toca (al volver a Inicio o tras un cambio desde el desglose).
  useLayoutEffect(() => {
    const el = arcTrack.current;
    if (!el) return;
    const first = el.dataset.init !== "1";
    el.dataset.init = "1";
    el.style.transition = first || jump.current ? "none" : ARC_T;
    el.style.transform = `translateX(${-page * 100}%)`;
    jump.current = false;
  }, [page, ready]);

  // Cambio desde el aro o los puntos: el desglose se desvanece y aparece el del mes nuevo.
  useEffect(() => {
    if (busy.current || shown === page) return;
    const t = window.setTimeout(() => setShown(page), FADE);
    return () => window.clearTimeout(t);
  }, [page, shown]);

  const jumpTo = useCallback((p: number) => { jump.current = true; setPage(p); setShown(p); }, [setPage]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let region: Region | null = null, lock: "h" | "v" | null = null, sx = 0, sy = 0, dx = 0, t0 = 0;
    const width = () => Math.max(1, el.clientWidth);
    const base = (p: number) => `translateX(${-p * 100}%)`;

    const start = (e: TouchEvent) => {
      region = null;
      if (busy.current || e.touches.length !== 1) return;
      const r = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-swipe]");
      if (!r || (e.target as HTMLElement).closest("input, textarea, select, [role=dialog]")) return;
      region = r.dataset.swipe as Region;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; lock = null; dx = 0; t0 = performance.now();
    };

    const move = (e: TouchEvent) => {
      if (!region) return;
      const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
      if (!lock) {
        if (Math.hypot(mx, my) < 6) return;
        lock = Math.abs(mx) >= Math.abs(my) * 0.6 ? "h" : "v";
      }
      if (lock === "v") return;
      if (e.cancelable) e.preventDefault();
      const { page: p, count: n } = st.current;
      dx = (p === 0 && mx > 0) || (p === n - 1 && mx < 0) ? mx * 0.3 : mx;
      if (region === "arc" && arcTrack.current) {
        arcTrack.current.style.transition = "none";
        arcTrack.current.style.transform = `translateX(calc(${-p * 100}% + ${dx}px))`;
      } else if (region === "list" && list.current) {
        list.current.style.transition = "none";
        list.current.style.transform = `translateX(${dx}px)`;
        list.current.style.opacity = String(1 - Math.min(0.6, (Math.abs(dx) / width()) * 0.8));
      }
    };

    const end = () => {
      const r = region;
      region = null;
      if (!r || lock !== "h") return;
      const { page: p, count: n } = st.current;
      const v = dx / Math.max(1, performance.now() - t0);
      const dir = dx < -width() * 0.18 || v < -0.35 ? 1 : dx > width() * 0.18 || v > 0.35 ? -1 : 0;
      const t = Math.min(n - 1, Math.max(0, p + dir));
      const a = arcTrack.current, l = list.current, f = arcFade.current;

      if (r === "arc") {
        if (a) { a.style.transition = ARC_T; a.style.transform = base(t); }
        if (t !== p) setPage(t);
        return;
      }
      if (!l) return;
      if (t === p) {
        l.style.transition = "transform 220ms ease-out, opacity 220ms ease-out";
        l.style.transform = "translateX(0)"; l.style.opacity = "1";
        return;
      }
      // Desde el desglose: se va hacia el lado del gesto, el aro se desvanece; luego entra el nuevo desde el otro.
      busy.current = true;
      const w = width();
      l.style.transition = "transform 180ms ease-in, opacity 180ms ease-in";
      l.style.transform = `translateX(${dir > 0 ? -w : w}px)`; l.style.opacity = "0";
      if (f) { f.style.transition = `opacity ${FADE}ms ease-out`; f.style.opacity = "0"; }
      window.setTimeout(() => {
        jump.current = true;
        setPage(t); setShown(t);
        l.style.transition = "none";
        l.style.transform = `translateX(${dir > 0 ? w * 0.3 : -w * 0.3}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          l.style.transition = "transform 240ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease-out";
          l.style.transform = "translateX(0)"; l.style.opacity = "1";
          if (f) f.style.opacity = "1";
          window.setTimeout(() => { busy.current = false; }, 260);
        }));
      }, 180);
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [ready, setPage]);

  return { root, arcTrack, arcFade, list, shown, jumpTo, goTo: setPage };
}
