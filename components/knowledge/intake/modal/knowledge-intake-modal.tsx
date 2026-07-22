// components/knowledge/intake/modal/knowledge-intake-modal.tsx

"use client";

import { KnowledgeIntakeFlow } from "@/components/knowledge/intake/knowledge-intake-flow";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { KnowledgeIntakeModalHeader } from "./knowledge-intake-modal-header";
import type { KnowledgeIntakeModalProps } from "./knowledge-intake-modal.types";

export function KnowledgeIntakeModal({ open, context, onOpenChange, onCompleted }: KnowledgeIntakeModalProps) {
  if (!context) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-h-[92vh] w-[50vw] max-w-[50vw] gap-0 overflow-hidden p-0">
        <KnowledgeIntakeModalHeader context={context} />
        <div className="max-h-[calc(92vh-98px)] overflow-y-auto p-6">
          <KnowledgeIntakeFlow libraryId={context.libraryId} onCompleted={onCompleted} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
