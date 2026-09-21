// create-folder-dialog/folder-access-options.tsx

"use client";

import {
  Check,
  LockKeyhole,
  UsersRound,
} from "lucide-react";

import type { AccessMode } from "./use-create-folder";

type Props = {
  value: AccessMode;
  disabled: boolean;
  onChange: (value: AccessMode) => void;
};

const options = [
  {
    value: "private",
    title: "Solo yo",
    description: "No añadir destinatarios.",
    icon: LockKeyhole,
  },
  {
    value: "specific",
    title: "Personas y equipos específicos",
    description: "Selecciona quién podrá acceder.",
    icon: UsersRound,
  },
] as const;

export function FolderAccessOptions({
  value,
  disabled,
  onChange,
}: Props) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-foreground">
          Quiénes tendrán acceso
        </p>

        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Elige quién tendrá acceso a esta carpeta.
        </p>
      </div>

      <div className="space-y-1.5">
        {options.map((option) => {
          const selected = value === option.value;
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`flex min-h-12 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition disabled:opacity-50 ${
                selected
                  ? "border-foreground bg-surface"
                  : "border-border hover:bg-surface"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted-foreground"
                }`}
              >
                {selected && (
                  <Check
                    className="h-3 w-3"
                    strokeWidth={3}
                  />
                )}
              </span>

              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground">
                  {option.title}
                </span>

                <span className="block text-[11px] text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}