// components/knowledge/content/create-folder-dialog/folder-recipient-picker.tsx
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, X } from "lucide-react";

import type { FolderRecipient } from "@/lib/actions/knowledge-folder-recipients.actions";
import type { SelectedFolderRecipient } from "./use-create-folder";

type Props = {
  suggestions: FolderRecipient[];
  selectedRecipients: SelectedFolderRecipient[];
  search: string;
  suggestionsOpen: boolean;
  loading: boolean;
  error: string | null;
  inputError: string | null;
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onSuggestionsOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onAddEmails: (value: string) => boolean;
  onRemove: (id: string) => void;
  onInputErrorChange: (value: string | null) => void;
};

export function FolderRecipientPicker({
  suggestions,
  selectedRecipients,
  search,
  suggestionsOpen,
  loading,
  error,
  inputError,
  disabled,
  onSearchChange,
  onSuggestionsOpenChange,
  onSelect,
  onAddEmails,
  onRemove,
  onInputErrorChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const [activeIndex, setActiveIndex] = useState(-1);

  const [popupPosition, setPopupPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  useEffect(() => {
    if (!suggestionsOpen) return;

    function updatePosition() {
      const rect =
        fieldRef.current?.getBoundingClientRect();

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
        fieldRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }

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
    };
  }, [suggestionsOpen, onSuggestionsOpenChange]);

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key === "ArrowDown" &&
      suggestionsOpen &&
      suggestions.length > 0
    ) {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, suggestions.length - 1),
      );
      return;
    }

    if (
      event.key === "ArrowUp" &&
      suggestionsOpen &&
      suggestions.length > 0
    ) {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Escape") {
      if (suggestionsOpen) {
        event.stopPropagation();
        onSuggestionsOpenChange(false);
      }
      return;
    }

    if (
      event.key === "Backspace" &&
      !search &&
      selectedRecipients.length > 0
    ) {
      onRemove(
        selectedRecipients[
          selectedRecipients.length - 1
        ].id,
      );
      return;
    }

    if (
      event.key !== "Enter" &&
      event.key !== "Tab" &&
      event.key !== "," &&
      event.key !== ";"
    ) {
      return;
    }

    const value = search.trim();

    if (!value) return;

    const selectedSuggestion =
      activeIndex >= 0
        ? suggestions[activeIndex]
        : undefined;

    if (
      event.key === "Enter" &&
      suggestionsOpen &&
      selectedSuggestion
    ) {
      event.preventDefault();
      onSelect(selectedSuggestion.id);
      setActiveIndex(-1);
      return;
    }

    // Tab mantiene su comportamiento normal cuando
    // no hay un correo válido que confirmar.
    if (
      event.key === "Tab" &&
      !value.includes("@")
    ) {
      return;
    }

    event.preventDefault();

    onAddEmails(value);
    setActiveIndex(-1);
  }

  function handlePaste(
    event: ClipboardEvent<HTMLInputElement>,
  ) {
    const pastedText =
      event.clipboardData.getData("text");

    if (!/[\s,;]/.test(pastedText.trim())) {
      return;
    }

    event.preventDefault();

    const combined = [search, pastedText]
      .filter(Boolean)
      .join(" ");

    onAddEmails(combined);
    setActiveIndex(-1);
  }

  const popup =
    suggestionsOpen &&
    !disabled &&
    search.trim().length > 0 &&
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
                No hay coincidencias. Puedes añadir
                un correo externo.
              </p>
            ) : (
              suggestions.map((recipient, index) => (
                <button
                  key={recipient.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() =>
                    setActiveIndex(index)
                  }
                  onClick={() => {
                    onSelect(recipient.id);
                    setActiveIndex(-1);
                    inputRef.current?.focus();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface focus:bg-surface focus:outline-none ${
                    index === activeIndex
                      ? "bg-surface"
                      : ""
                  }`}
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
    <div className="space-y-2">
      <label
        htmlFor="folder-recipients"
        className="block text-xs font-semibold text-foreground"
      >
        Personas y correos electrónicos
      </label>

      <div
        ref={fieldRef}
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 transition-colors focus-within:border-foreground"
      >
        {selectedRecipients.length === 0 && (
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {selectedRecipients.map((recipient) => (
          <span
            key={recipient.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-foreground"
          >
            <span className="max-w-40 truncate">
              {recipient.external
                ? recipient.email
                : recipient.name}
            </span>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(recipient.id);
              }}
              disabled={disabled}
              aria-label={`Quitar a ${recipient.name}`}
              className="shrink-0 rounded hover:bg-background disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

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
            onInputErrorChange(null);
            onSuggestionsOpenChange(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={
            selectedRecipients.length > 0
              ? "Añadir más..."
              : "Nombre o correo electrónico"
          }
          className="h-7 min-w-28 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </div>

      {popup}

      {inputError && (
        <p className="text-[11px] text-red-600">
          {inputError}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Pulsa Intro o Tab para añadir un correo.
        También puedes pegar varios correos separados
        por comas, espacios o saltos de línea.
      </p>
    </div>
  );
}