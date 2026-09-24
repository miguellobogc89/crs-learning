
// components/knowledge/detail/shared/knowledge-edit-actions.tsx

"use client";

import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type KnowledgeEditActionsProps = {
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
  hasChanges?: boolean;
};

export function KnowledgeEditActions({
  onSave,
  onCancel,
  isSaving = false,
  hasChanges = true,
}: KnowledgeEditActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSaving || !onCancel}
        onClick={onCancel}
      >
        <X className="mr-2 h-4 w-4" />
        Cancelar
      </Button>

      <Button
        type="button"
        size="sm"
        disabled={isSaving || !hasChanges || !onSave}
        onClick={onSave}
      >
        <Check className="mr-2 h-4 w-4" />
        {isSaving ? "Guardando..." : "Guardar cambios"}
      </Button>
    </div>
  );
}