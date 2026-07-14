// components/ui/app-dialog.tsx
"use client";

import type {
  MouseEvent,
  ReactNode,
} from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  disabled?: boolean;
  maxWidthClassName?: string;
};

export function AppDialog({
  open,
  title,
  children,
  footer,
  onClose,
  disabled = false,
  maxWidthClassName = "max-w-[500px]",
}: Props) {
  if (!open) {
    return null;
  }

  function handleBackdropClick(
    event: MouseEvent<HTMLDivElement>,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (disabled) {
      return;
    }

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8"
      onMouseDown={handleBackdropClick}
    >
      <section
        className={[
          "w-full rounded-2xl bg-background shadow-2xl",
          maxWidthClassName,
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between px-8 pt-7">
          <h2 className="text-xl font-semibold text-foreground">
            {title}
          </h2>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-50"
            onClick={onClose}
            disabled={disabled}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-8 py-6">
          {children}
        </div>

        {footer ? (
          <footer className="flex items-center justify-end gap-3 border-t border-border px-8 py-5">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}