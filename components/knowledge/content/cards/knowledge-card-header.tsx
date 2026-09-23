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
    <div className="relative z-30 flex h-[52px] w-full shrink-0 items-center justify-between border-b border-border/50 px-4">
      {/* Casilla de selección */}
      <div
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center transition-opacity duration-200",
          selected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        ].join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        {selectionControl}
      </div>

      {/* Tres puntos */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!shadow-none [&_button]:!ring-0 [&_button]:!ring-offset-0"
        onClick={(event) => event.stopPropagation()}
      >
        {menu}
      </div>
    </div>
  );
}