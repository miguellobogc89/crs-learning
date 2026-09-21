// components/knowledge/content/create-folder-dialog/folder-review.tsx
"use client";

import { useState } from "react";
import { Mail, UserRound } from "lucide-react";

import type {
  AccessLevel,
  SelectedFolderRecipient,
} from "./use-create-folder";

type Props = {
  folderName: string;
  recipients: SelectedFolderRecipient[];
};

export function FolderReview({
  folderName,
  recipients,
}: Props) {
  const [permissions, setPermissions] = useState<
    Record<string, AccessLevel>
  >({});

  function getPermission(id: string): AccessLevel {
    return permissions[id] ?? "read";
  }

  function changePermission(
    id: string,
    permission: AccessLevel,
  ) {
    setPermissions((current) => ({
      ...current,
      [id]: permission,
    }));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-surface/60 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Carpeta
        </p>

        <p className="truncate text-xs font-semibold text-foreground">
          {folderName}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-foreground">
          Revisar destinatarios y permisos
        </p>

        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {recipients.map((recipient) => (
            <div
              key={recipient.id}
              className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface">
                {recipient.external ? (
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {recipient.external
                    ? recipient.email
                    : recipient.name}
                </p>

                <p className="truncate text-[11px] text-muted-foreground">
                  {recipient.external
                    ? "Invitación pendiente"
                    : recipient.email}
                </p>
              </div>

              <select
                value={getPermission(recipient.id)}
                onChange={(event) =>
                  changePermission(
                    recipient.id,
                    event.target.value as AccessLevel,
                  )
                }
                aria-label={`Permisos de ${recipient.name}`}
                className="h-8 shrink-0 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-foreground"
              >
                <option value="read">Lectura</option>
                <option value="edit">Edición</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Vista previa: los permisos y las invitaciones
        todavía no se guardan.
      </p>
    </div>
  );
}