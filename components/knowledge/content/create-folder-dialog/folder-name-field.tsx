// create-folder-dialog/folder-name-field.tsx

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
        htmlFor="folder-name"
        className="block text-xs font-semibold text-foreground"
      >
        Nombre de carpeta
      </label>

      <input
        ref={inputRef}
        id="folder-name"
        type="text"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder="Nueva carpeta"
        maxLength={120}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground disabled:opacity-50"
      />

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}