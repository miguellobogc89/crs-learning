// components/knowledge/content/create-folder-dialog/folder-name-field.tsx
"use client";

import type { RefObject } from "react";

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  error: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function FolderNameField({
  inputRef,
  value,
  error,
  disabled,
  onChange,
}: Props) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="new-folder-name"
        className="block text-xs font-semibold text-foreground"
      >
        Nombre de la carpeta
      </label>

      <input
        ref={inputRef}
        id="new-folder-name"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={120}
        placeholder="Escribe un nombre"
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground disabled:opacity-50"
      />

      {error && (
        <p className="text-[11px] text-red-600">{error}</p>
      )}
    </div>
  );
}