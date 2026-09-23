// components/knowledge/content/cards/knowledge-card-header.tsx


"use client";

import type { ReactNode } from "react";

type KnowledgeCardHeaderProps = {
  selected: boolean;
  selectionControl: ReactNode;
  menu: ReactNode;
};

export function KnowledgeCardHeader({
  selected,
  selectionControl,
  menu,
}: KnowledgeCardHeaderProps) {
  return (
    <div className="relative z-30 grid h-11 w-full shrink-0 grid-cols-[28px_1fr_28px] items-center border-b border-border/50 px-4">
      {/* Casilla: centrada en la primera columna */}
      <div
        className={[
          "flex h-7 w-7 items-center justify-center transition-opacity duration-200",
          selected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        ].join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        {selectionControl}
      </div>

      {/* Menú: centrado en la última columna */}
      <div
        className={[
          "col-start-3 flex h-7 w-7 items-center justify-center",
          "[&_button]:!border-0 [&_button]:!bg-transparent",
          "[&_button]:!shadow-none [&_button]:!ring-0",
          "[&_button]:!ring-offset-0",
        ].join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        {menu}
      </div>
    </div>
  );
}