"use client";

import { useEffect, useState } from "react";

/** Igual en el primer render SSR/cliente; solo cambia tras hidratar. */
export function useModuleHostname(): string | null {
  const [hostname, setHostname] = useState<string | null>(null);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  return hostname;
}
