"use client";
import { useEffect } from "react";
import { advanceIntake } from "./advance-intake";
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
          // Same orchestration as the upload modal: base reading, classification and vision reading advance
          // while the app is open, even with the modal closed.
          if (!stopped && batches[0]) await advanceIntake(batches[0].id, async (url, method) => {
            const res = await fetch(url, { method: method ?? "GET", cache: "no-store" });
            return res.json();
          }).catch(() => undefined);
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
