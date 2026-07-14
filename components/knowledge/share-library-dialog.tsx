// components/knowledge/share-library-dialog.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  UsersRound,
  X,
} from "lucide-react";

import {
  removeKnowledgeLibraryTeamShareAction,
  shareKnowledgeLibraryWithTeamAction,
} from "@/app/actions/knowledge";
import { AppDialog } from "@/components/ui/app-dialog";

type KnowledgeTeam = {
  id: string;
  name: string;
};

type LibraryShare = {
  id: string;
  team_id: string;
  access_level: string;
  knowledge_teams: {
    id: string;
    name: string;
    knowledge_team_members: {
      id: string;
    }[];
  };
};

type Props = {
  open: boolean;
  libraryId: string | null;
  libraryName: string;
  teams: KnowledgeTeam[];
  shares: LibraryShare[];
  onClose: () => void;
};

export function ShareLibraryDialog({
  open,
  libraryId,
  libraryName,
  teams,
  shares,
  onClose,
}: Props) {
  const router = useRouter();

  const [selectedTeamId, setSelectedTeamId] =
    useState("");
  const [accessLevel, setAccessLevel] =
    useState("read");
  const [error, setError] = useState<string | null>(
    null,
  );

  const [isPending, startTransition] =
    useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedTeamId("");
    setAccessLevel("read");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (isPending) {
        return;
      }

      onClose();
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, isPending, onClose]);

  const availableTeams = teams.filter((team) => {
    return !shares.some(
      (share) => share.team_id === team.id,
    );
  });

  const canShare =
    Boolean(libraryId) &&
    Boolean(selectedTeamId) &&
    !isPending;

  function handleShare() {
    if (!canShare || !libraryId) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();

        formData.set("libraryId", libraryId);
        formData.set("teamId", selectedTeamId);
        formData.set("accessLevel", accessLevel);

        await shareKnowledgeLibraryWithTeamAction(
          formData,
        );

        setSelectedTeamId("");
        setAccessLevel("read");

        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setError(caughtError.message);
          return;
        }

        setError(
          "No se ha podido compartir la carpeta",
        );
      }
    });
  }

  function handleRemoveShare(teamId: string) {
    if (!libraryId || isPending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();

        formData.set("libraryId", libraryId);
        formData.set("teamId", teamId);

        await removeKnowledgeLibraryTeamShareAction(
          formData,
        );

        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setError(caughtError.message);
          return;
        }

        setError(
          "No se ha podido retirar el acceso",
        );
      }
    });
  }

  return (
    <AppDialog
      open={open}
      title="Compartir carpeta"
      onClose={onClose}
      disabled={isPending}
      maxWidthClassName="max-w-[620px]"
      footer={
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="h-10 rounded-lg px-4 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {libraryName}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Los permisos se aplicarán a todos los
            artículos y subcarpetas incluidos.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Compartir con un equipo
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Selecciona un equipo y su nivel de acceso.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
            <select
              value={selectedTeamId}
              onChange={(event) => {
                setSelectedTeamId(
                  event.target.value,
                );
                setError(null);
              }}
              disabled={
                isPending ||
                availableTeams.length === 0
              }
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground disabled:opacity-50"
            >
              <option value="">
                Seleccionar equipo
              </option>

              {availableTeams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                >
                  {team.name}
                </option>
              ))}
            </select>

            <select
              value={accessLevel}
              onChange={(event) =>
                setAccessLevel(event.target.value)
              }
              disabled={isPending}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground disabled:opacity-50"
            >
              <option value="read">
                Lectura
              </option>

              <option value="edit">
                Edición
              </option>

              <option value="owner">
                Owner
              </option>
            </select>

            <button
              type="button"
              onClick={handleShare}
              disabled={!canShare}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Compartir"
              )}
            </button>
          </div>

          {availableTeams.length === 0 &&
          teams.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Todos tus equipos ya tienen acceso.
            </p>
          ) : null}

          {teams.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todavía no tienes equipos disponibles.
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Equipos con acceso
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Consulta o elimina los permisos actuales.
            </p>
          </div>

          {shares.length > 0 ? (
            <div className="space-y-3">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                      <UsersRound className="h-4 w-4" />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {
                          share.knowledge_teams
                            .name
                        }
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {
                          share.knowledge_teams
                            .knowledge_team_members
                            .length
                        }{" "}
                        miembros ·{" "}
                        {share.access_level}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleRemoveShare(
                        share.team_id,
                      )
                    }
                    disabled={isPending}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground">
                <Check className="h-4 w-4" />
              </span>

              <p className="text-sm text-muted-foreground">
                Esta carpeta todavía no está compartida
                con ningún equipo.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppDialog>
  );
}