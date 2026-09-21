// components/knowledge/content/create-folder-dialog/index.tsx
"use client";

import { useEffect, useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";

import { useCreateFolder } from "./use-create-folder";
import { FolderNameField } from "./folder-name-field";
import { FolderAccessOptions } from "./folder-access-options";
import { FolderRecipientPicker } from "./folder-recipient-picker";
import { FolderReview } from "./folder-review";

type Props = {
  open: boolean;
  parentLibraryId: string | null;
  onClose: () => void;
};

type Step = 1 | 2 | 3;

export function CreateFolderDialog({
  open,
  parentLibraryId,
  onClose,
}: Props) {
  const folder = useCreateFolder({
    open,
    parentLibraryId,
    onClose,
  });

  const [step, setStep] = useState<Step>(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  if (!open) return null;

  const isShared = folder.accessMode === "specific";

  function goBack() {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  }

  function goForward() {
    if (step === 1) {
      if (!folder.name.trim()) {
        folder.setError(
          "Introduce un nombre para la carpeta",
        );
        return;
      }

      folder.setError(null);

      if (isShared) {
        setStep(2);
      } else {
        setStep(3);
      }

      return;
    }

    if (step === 2) {
      if (
        folder.selectedRecipients.length === 0 &&
        !folder.search.trim()
      ) {
        folder.setInputError(
          "Añade al menos un destinatario",
        );
        return;
      }

      if (folder.search.trim()) {
        const added = folder.addEmails(
          folder.search,
        );

        if (!added) return;
      }

      setStep(3);
    }
  }

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <button
        type="button"
        onClick={step === 1 ? onClose : goBack}
        disabled={folder.isPending}
        className="h-9 rounded-lg px-3 text-xs font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
      >
        {step === 1 ? "Cancelar" : "Atrás"}
      </button>

      {step < 3 ? (
        <button
          type="button"
          onClick={goForward}
          disabled={
            folder.isPending ||
            (step === 1 && !folder.name.trim())
          }
          className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
        </button>
      ) : (
        <button
          type="submit"
          form="create-folder-form"
          disabled={!folder.canCreate}
          title={
            isShared
              ? "La creación de carpetas compartidas se conectará próximamente"
              : undefined
          }
          className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {folder.isPending
            ? "Creando..."
            : "Crear carpeta"}
        </button>
      )}
    </div>
  );

  return (
    <AppDialog
      open={open}
      title="Nueva carpeta"
      onClose={onClose}
      disabled={folder.isPending}
      maxWidthClassName="max-w-[440px]"
      footer={footer}
    >
      <form
        id="create-folder-form"
        onSubmit={folder.handleSubmit}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-muted-foreground">
            {step === 1
              ? "Nombre y acceso"
              : step === 2
                ? "Seleccionar destinatarios"
                : "Revisar y confirmar"}
          </p>

          <span className="text-[11px] text-muted-foreground">
            Paso {step} de {isShared ? 3 : 2}
          </span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <FolderNameField
              inputRef={folder.nameInputRef}
              value={folder.name}
              error={folder.error}
              disabled={folder.isPending}
              onChange={(value) => {
                folder.setName(value);
                folder.setError(null);
              }}
            />

            <FolderAccessOptions
              value={folder.accessMode}
              disabled={folder.isPending}
              onChange={folder.changeAccessMode}
            />
          </div>
        )}

        {step === 2 && isShared && (
          <FolderRecipientPicker
            suggestions={folder.suggestions}
            selectedRecipients={
              folder.selectedRecipients
            }
            search={folder.search}
            suggestionsOpen={
              folder.suggestionsOpen
            }
            loading={folder.loadingRecipients}
            error={folder.recipientsError}
            inputError={folder.inputError}
            disabled={folder.isPending}
            onSearchChange={folder.setSearch}
            onSuggestionsOpenChange={
              folder.setSuggestionsOpen
            }
            onSelect={folder.selectRecipient}
            onAddEmails={folder.addEmails}
            onRemove={folder.removeRecipient}
            onInputErrorChange={
              folder.setInputError
            }
          />
        )}

        {step === 3 && (
          isShared ? (
            <FolderReview
              folderName={folder.name.trim()}
              recipients={folder.selectedRecipients}
              permissions={folder.permissions}
              onPermissionChange={folder.changePermission}
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-surface/50 p-3">
              <p className="text-xs font-semibold text-foreground">
                {folder.name.trim()}
              </p>

              <p className="text-xs text-muted-foreground">
                Carpeta privada. Solo tú tendrás acceso
                inicialmente.
              </p>
            </div>
          )
        )}

        {step === 3 && isShared && (
          <p className="text-[11px] text-muted-foreground">
            La creación compartida estará disponible
            cuando conectemos los permisos y las
            invitaciones al servidor.
          </p>
        )}
      </form>
    </AppDialog>
  );
}