// components/knowledge/content/cards/shared/card-selection-checkbox.tsx
"use client";

import { Check } from "lucide-react";

type Props = {
  selected: boolean;
  label: string;
  onSelectedChange: (selected: boolean) => void;
};

export function CardSelectionCheckbox({
  selected,
  label,
  onSelectedChange,
}: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectedChange(!selected);
      }}
      className={[
        "flex h-7 w-7 items-center justify-center rounded-md border shadow-sm transition",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : [
              "border-border/80",
              "bg-background/95",
              "text-transparent",
              "hover:border-primary/50",
              "hover:bg-background",
            ].join(" "),
      ].join(" ")}
    >
      <Check className="h-4 w-4" strokeWidth={2.75} />
    </button>
  );
}