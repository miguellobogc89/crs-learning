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
          "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          isOpen
            ? "bg-brand text-brand-foreground"
            : "bg-brand-soft text-brand group-hover:bg-brand group-hover:text-brand-foreground",
        ].join(" ")}
      >
        <Bot className="size-icon-md" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-body font-medium">
            Asistente
          </span>

          <Sparkles
            className={[
              "size-icon-sm",
              isOpen
                ? "text-brand"
                : "text-muted-foreground",
            ].join(" ")}
          />
        </span>

        <span className="mt-0.5 block truncate text-caption text-muted-foreground">
          Pregunta sobre tu conocimiento
        </span>
      </span>
    </button>
  );
}
