// components/knowledge/intake/modal/knowledge-intake-close-guard.tsx

import {
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmClose: () => void;
};

export function KnowledgeIntakeCloseGuard({
  open,
  onOpenChange,
  onConfirmClose,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>

            <div>
              <DialogTitle>
                ¿Cerrar la incorporación?
              </DialogTitle>

              <DialogDescription className="mt-2 leading-6">
                Se perderán los documentos
                seleccionados y la propuesta que
                todavía no haya sido confirmada.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onOpenChange(false)
            }
          >
            Continuar trabajando
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={onConfirmClose}
          >
            Salir sin guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}