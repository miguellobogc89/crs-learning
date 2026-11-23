"use client";
// components/finance/privacy.ts
// «Ocultar importes»: difumina las cifras (clase .amount) en toda la app de finanzas. Se recuerda en este
// navegador; útil para abrirla delante de otra gente.
import { useCallback, useEffect, useState } from "react";

const KEY = "crs-finance:hide-amounts";
const EVENT = "finance:hide-amounts";

function apply(on: boolean) {
  document.documentElement.classList.toggle("finance-hide", on);
}

export function useHideAmounts() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let on = false;
    try {
      on = window.localStorage.getItem(KEY) === "1";
    } catch {
      // Sin almacenamiento: visibles.
    }
    setHidden(on);
    apply(on);
    const sync = () => setHidden(document.documentElement.classList.contains("finance-hide"));
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const toggle = useCallback(() => {
    const on = !document.documentElement.classList.contains("finance-hide");
    apply(on);
    try {
      window.localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Vale para esta visita.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { hidden, toggle };
}
