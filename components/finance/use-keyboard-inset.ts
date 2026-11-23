"use client";
// En el iPhone, el teclado tapa lo que está pegado abajo (las hojas que suben desde abajo): Safari no encoge la
// página, solo el «visualViewport». Este hook devuelve cuántos píxeles ocupa el teclado para subir la hoja por
// encima. En el ordenador (o sin teclado) vale 0.
import { useEffect, useState } from "react";

export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return inset;
}

/** Estilo para una hoja de abajo: se apoya encima del teclado y no crece más de lo que queda visible. */
export const aboveKeyboard = (inset: number, tall: boolean) =>
  inset > 0
    ? { bottom: inset, maxHeight: `calc(100dvh - ${inset}px - 1.5rem)`, ...(tall ? { height: `calc(100dvh - ${inset}px - 1.5rem)` } : {}) }
    : undefined;
