// components/knowledge/content/create-folder-dialog/folder-access-options.tsx
"use client";

import { LockKeyhole, UsersRound } from "lucide-react";

import type { AccessMode } from "./use-create-folder";

type Props = {
  value: AccessMode;
  disabled: boolean;
  onChange: (value: AccessMode) => void;
};

export function FolderAccessOptions({
  value,
  disabled,
  onChange,
}: Props) {
  const options = [
    {
      id: "private",
      title: "Privada",
      description: "Solo tú tendrás acceso a esta carpeta.",
      Icon: LockKeyhole,
    },
    {
      id: "specific",
      title: "Compartida",
      description: "Selecciona quién puede acceder a ella.",
      Icon: UsersRound,
    },
  ] as const;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">
        Acceso
      </p>

      <div className="grid grid-cols-2 gap-2">
        {options.map(({ id, title, description, Icon }) => {
          const selected = value === id;

          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={`rounded-lg border p-3 text-left transition disabled:opacity-50 ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-surface"
              }`}
            >
              <Icon
                className={`mb-2 h-4 w-4 ${
                  selected
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />

              <p className="text-xs font-semibold text-foreground">
                {title}
              </p>

              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}