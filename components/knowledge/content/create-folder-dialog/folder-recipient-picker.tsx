// create-folder-dialog/folder-recipient-picker.tsx

"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Search,
  X,
} from "lucide-react";

import type { FolderRecipient } from "@/lib/actions/knowledge-folder-recipients.actions";
import type { AccessLevel } from "./use-create-folder";

type Props = {
  suggestions: FolderRecipient[];
  selectedRecipients: FolderRecipient[];
  search: string;
  suggestionsOpen: boolean;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  accessLevel: AccessLevel;
  onSearchChange: (value: string) => void;
  onSuggestionsOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAccessLevelChange: (level: AccessLevel) => void;
};

export function FolderRecipientPicker({
  suggestions,
  selectedRecipients,
  search,
  suggestionsOpen,
  loading,
  error,
  disabled,
  accessLevel,
  onSearchChange,
  onSuggestionsOpenChange,
  onSelect,
  onRemove,
  onAccessLevelChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const [popupPosition, setPopupPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  useEffect(() => {
    if (!suggestionsOpen) return;

    function updatePosition() {
      const rect =
        inputRef.current?.getBoundingClientRect();

      if (!rect) return;

      setPopupPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        inputRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }

      onSuggestionsOpenChange(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.stopImmediatePropagation();
      onSuggestionsOpenChange(false);
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener(
      "scroll",
      updatePosition,
      true,
    );
    document.addEventListener(
      "pointerdown",
      handlePointerDown,
      true,
    );
    window.addEventListener(
      "keydown",
      handleEscape,
      true,
    );

    return () => {
      window.removeEventListener(
        "resize",
        updatePosition,
      );
      window.removeEventListener(
        "scroll",
        updatePosition,
        true,
      );
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true,
      );
      window.removeEventListener(
        "keydown",
        handleEscape,
        true,
      );
    };
  }, [
    suggestionsOpen,
    onSuggestionsOpenChange,
  ]);

  const popup =
    suggestionsOpen &&
    !disabled &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popupRef}
            id={listId}
            role="listbox"
            aria-label="Personas sugeridas"
            style={{
              position: "fixed",
              top: popupPosition.top,
              left: popupPosition.left,
              width: popupPosition.width,
              zIndex: 9999,
            }}
            className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-xl"
          >
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando personas...
              </div>
            ) : error ? (
              <p className="px-3 py-3 text-xs text-red-600">
                {error}
              </p>
            ) : suggestions.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No hay personas disponibles para esta búsqueda.
              </p>
            ) : (
              suggestions.map((recipient) => (
                <button
                  key={recipient.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onSelect(recipient.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface focus:bg-surface focus:outline-none"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-foreground">
                    {recipient.name
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {recipient.name}
                    </span>

                    <span className="block truncate text-[11px] text-muted-foreground">
                      {recipient.email}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface/50 p-3">
      <div className="space-y-1.5">
        <label
          htmlFor="folder-recipients"
          className="block text-xs font-semibold text-foreground"
        >
          Personas
        </label>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

          <input
            ref={inputRef}
            id="folder-recipients"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls={listId}
            autoComplete="off"
            value={search}
            onFocus={() =>
              onSuggestionsOpenChange(true)
            }
            onChange={(event) => {
              onSearchChange(event.target.value);
              onSuggestionsOpenChange(true);
            }}
            disabled={disabled}
            placeholder="Buscar por nombre o correo"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground disabled:opacity-50"
          />
        </div>

        {popup}

        {selectedRecipients.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedRecipients.map((recipient) => (
              <span
                key={recipient.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground"
              >
                <span className="truncate">
                  {recipient.name}
                </span>

                <button
                  type="button"
                  onClick={() => onRemove(recipient.id)}
                  disabled={disabled}
                  aria-label={`Quitar a ${recipient.name}`}
                  className="shrink-0 rounded-full hover:bg-surface disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="folder-access-level"
          className="block text-xs font-semibold text-foreground"
        >
          Nivel de acceso
        </label>

        <select
          id="folder-access-level"
          value={accessLevel}
          onChange={(event) =>
            onAccessLevelChange(
              event.target.value as AccessLevel,
            )
          }
          disabled={disabled}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-foreground"
        >
          <option value="read">Lectura</option>
          <option value="edit">Edición</option>
        </select>
      </div>
    </div>
  );
}