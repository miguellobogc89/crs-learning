"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies text to the clipboard. Not a processing action: it never calls the server. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return <Button variant="outline" size="sm" onClick={copy}>{state === "copied" ? "Copiado" : state === "error" ? "No se pudo copiar" : label}</Button>;
}
