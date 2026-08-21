// components/app/assistant-sidebar-trigger.tsx

"use client";

import { useEffect, useState } from "react";
import { Bot, Sparkles } from "lucide-react";

export function AssistantSidebarTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleAssistantState(event: Event) {
      const customEvent = event as CustomEvent<{
        isOpen: boolean;
      }>;

      setIsOpen(customEvent.detail.isOpen);
    }

    window.addEventListener(
      "crs:assistant-state",
      handleAssistantState,
    );

    return () => {
      window.removeEventListener(
        "crs:assistant-state",
        handleAssistantState,
      );
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new Event("crs:toggle-assistant"),
        );
      }}
      className={[
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
        isOpen
          ? "border-brand bg-brand-soft text-foreground"
          : "border-border bg-background text-foreground hover:border-brand/30 hover:bg-brand-soft",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          isOpen
            ? "bg-brand text-brand-foreground"
            : "bg-brand-soft text-brand group-hover:bg-brand group-hover:text-brand-foreground",
        ].join(" ")}
      >
        <Bot className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium">
            Asistente
          </span>

          <Sparkles
            className={[
              "h-3.5 w-3.5",
              isOpen
                ? "text-brand"
                : "text-muted-foreground",
            ].join(" ")}
          />
        </span>

        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          Pregunta sobre tu conocimiento
        </span>
      </span>
    </button>
  );
}