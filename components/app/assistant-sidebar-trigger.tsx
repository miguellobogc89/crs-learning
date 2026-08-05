"use client";

import { Bot } from "lucide-react";

export function AssistantSidebarTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new Event("crs:open-assistant"),
        );
      }}
      className="flex h-11 w-full items-center gap-3 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface text-muted-foreground">
        <Bot className="h-4 w-4" />
      </span>
      Asistente
    </button>
  );
}
