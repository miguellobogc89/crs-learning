// create-folder-dialog/index.tsx

"use client";

import { AppDialog } from "@/components/ui/app-dialog";

import { useCreateFolder } from "./use-create-folder";
import { FolderNameField } from "./folder-name-field";
import { FolderAccessOptions } from "./folder-access-options";
import { FolderRecipientPicker } from "./folder-recipient-picker";

type Props = {
  open: boolean;
  parentLibraryId: string | null;
  onClose: () => void;
};

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

  if (!open) return null;

  return (
    <form onSubmit={folder.handleSubmit}>
      <AppDialog
        open={open}
        title="Nueva carpeta"
        onClose={onClose}
        disabled={folder.isPending}
        maxWidthClassName="max-w-[400px]"
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={folder.isPending}
              className="h-9 rounded-lg px-3 text-xs font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!folder.canCreate}
              className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {folder.isPending ? "Creando..." : "Crear"}
            </button>
          </>
        }
      >
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

          {folder.accessMode === "specific" && (
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
              disabled={folder.isPending}
              accessLevel={folder.accessLevel}
              onSearchChange={folder.setSearch}
              onSuggestionsOpenChange={
                folder.setSuggestionsOpen
              }
              onSelect={folder.selectRecipient}
              onRemove={folder.removeRecipient}
              onAccessLevelChange={
                folder.setAccessLevel
              }
            />
          )}
        </div>
      </AppDialog>
    </form>
  );
}