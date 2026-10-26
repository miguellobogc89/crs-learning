"use client";
import { useEffect } from "react";
/** Advances the persisted queue while the app is open, independently of the modal. */
export function IntakeQueue() {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const response = await fetch("/api/knowledge/intake", { cache: "no-store" });
        if (response.ok) {
          const batches: { id: string }[] = await response.json();
          if (!stopped && batches[0]) await fetch(`/api/knowledge/intake/${batches[0].id}`, { method: "POST" });
        }
      } finally {
        if (!stopped) timer = setTimeout(() => { void tick().catch(() => undefined); }, 3000);
      }
    }
    void tick().catch(() => undefined);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return null;
}
