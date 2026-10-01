// components/app/assistant-sidebar-trigger.tsx

"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

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
        `
          group flex w-full items-center gap-3
          rounded-xl
          px-3 py-2.5
          text-left
          transition-colors duration-200
        `,
        isOpen
          ? "bg-[#E4EDFF] text-slate-950"
          : "bg-[#EDF3FF] text-slate-800 hover:bg-[#E4EDFF]",
      ].join(" ")}
    >
      <span
        className={[
          `
            flex size-8 shrink-0
            items-center justify-center
            rounded-lg
            transition-colors
          `,
          isOpen
            ? "bg-[#0A58FF] text-white"
            : "bg-white/80 text-[#0A58FF] group-hover:bg-white",
        ].join(" ")}
      >
        <Bot className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        Asistente
      </span>
    </button>
  );
}