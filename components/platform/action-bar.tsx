"use client";

import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActionBarProps = {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
};

/** Par estándar de acciones, siempre con Cancelar antes de Confirmar. */
export function ActionBar({
  onCancel,
  onConfirm,
  confirmLabel = "Guardar",
  cancelLabel = "Cancelar",
  disabled = false,
  loading = false,
  destructive = false,
}: ActionBarProps) {
  return (
    <div className="flex w-full items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 min-w-0 flex-1 rounded-xl"
        onClick={onCancel}
        disabled={loading}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant={destructive ? "destructive" : "corporate"}
        size="lg"
        className="h-11 min-w-0 flex-1 rounded-xl"
        onClick={onConfirm}
        disabled={disabled || loading}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
        {confirmLabel}
      </Button>
    </div>
  );
}
