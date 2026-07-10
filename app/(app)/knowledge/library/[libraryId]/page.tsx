// app/(app)/knowledge/library/[libraryId]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock, Share2, UsersRound, X } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";
import {
  listTeams,
  listTeamSharesForLibrary,
} from "@/lib/services/knowledge-team.service";
import {
  removeKnowledgeLibraryTeamShareAction,
  shareKnowledgeLibraryWithTeamAction,
} from "@/app/actions/knowledge";

export default async function KnowledgeLibraryAdminPage({
  params,
}: {
  params: Promise<{ libraryId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { libraryId } = await params;

  const libraries = await listKnowledgeLibraries(session.user.id);
  const library = libraries.find((item) => item.id === libraryId);

  if (!library) {
    notFound();
  }

  const isRootLibrary = library.parent_id === null;

  const [teams, shares] = isRootLibrary
    ? [[], []]
    : await Promise.all([
        listTeams(session.user.id),
        listTeamSharesForLibrary({
          libraryId,
          ownerUserId: session.user.id,
        }),
      ]);

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href={`/knowledge?library=${library.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a la biblioteca
            </Link>
          </Button>
        </div>

        <div className="mb-8 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              {isRootLibrary ? (
                <Lock className="h-5 w-5" />
              ) : (
                <Share2 className="h-5 w-5" />
              )}
            </span>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Administrar biblioteca
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {library.name}
              </p>
            </div>
          </div>
        </div>

        {isRootLibrary ? (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Raíz privada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta biblioteca es tu unidad principal privada y no se puede
              compartir directamente. Crea una carpeta dentro de ella y comparte
              esa carpeta con un equipo.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Compartir con equipos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Da acceso a un equipo completo a esta biblioteca.
            </p>

            <form
              action={shareKnowledgeLibraryWithTeamAction}
              className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]"
            >
              <input type="hidden" name="libraryId" value={library.id} />

              <select
                name="teamId"
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="">Seleccionar equipo</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <select
                name="accessLevel"
                defaultValue="read"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="read">Lectura</option>
                <option value="edit">Edición</option>
                <option value="owner">Owner</option>
              </select>

              <Button type="submit">Compartir</Button>
            </form>

            <div className="mt-6 space-y-3">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                      <UsersRound className="h-4 w-4" />
                    </span>

                    <div>
                      <div className="font-medium">
                        {share.knowledge_teams.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {share.knowledge_teams.knowledge_team_members.length}{" "}
                        miembros · {share.access_level}
                      </div>
                    </div>
                  </div>

                  <form action={removeKnowledgeLibraryTeamShareAction}>
                    <input type="hidden" name="libraryId" value={library.id} />
                    <input type="hidden" name="teamId" value={share.team_id} />

                    <Button type="submit" variant="outline" size="sm">
                      <X className="mr-2 h-4 w-4" />
                      Quitar
                    </Button>
                  </form>
                </div>
              ))}
            </div>

            {shares.length === 0 ? (
              <div className="mt-5 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
                Esta biblioteca todavía no está compartida con ningún equipo.
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}