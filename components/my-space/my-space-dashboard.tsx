// components/my-space/my-space-dashboard.tsx
"use client";

import { useState, type ElementType } from "react";
import {
  Activity,
  Building2,
  FileText,
  GraduationCap,
  MoreHorizontal,
  Plus,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addKnowledgeTeamMemberAction,
  createKnowledgeTeamAction,
} from "@/app/actions/knowledge";

type Team = {
  id: string;
  name: string;
  description?: string | null;
  knowledge_team_members?: unknown[];
  _count?: {
    knowledge_team_members?: number;
  };
};

type Props = {
  teams: Team[];
};

const courses = [
  { title: "Onboarding Knowledge Hub", progress: 68, status: "En curso" },
  { title: "Buenas prácticas documentales", progress: 35, status: "Pendiente" },
];

const activity = [
  "Subiste un documento a Knowledge",
  "Se actualizó un equipo",
  "Completaste una lección",
  "Se generó nuevo conocimiento por IA",
];

export function MySpaceDashboard({ teams }: Props) {
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Mi espacio
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Gestiona tu actividad, equipos, cursos y aportaciones dentro de la plataforma.
            </p>
          </div>

          <Button onClick={() => setShowCreateTeam((value) => !value)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo grupo
          </Button>
        </div>

        {showCreateTeam && (
          <form
            action={createKnowledgeTeamAction}
            className="mb-6 rounded-2xl border border-border bg-card p-5"
          >
            <h2 className="font-semibold">Crear nuevo grupo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea un equipo para compartir conocimiento y organizar miembros.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <input
                name="name"
                placeholder="Nombre del grupo"
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              />

              <input
                name="description"
                placeholder="Descripción"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              />

              <Button type="submit">Crear</Button>
            </div>
          </form>
        )}

        <div className="grid gap-6">
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Resumen de mi empresa</h2>
                <p className="text-sm text-muted-foreground">
                  CRS Learning · Usuario interno
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Metric label="Miembros" value="-" />
              <Metric label="Equipos" value={String(teams.length)} />
              <Metric label="Cursos activos" value="12" />
              <Metric label="Estado" value="Activo" />
            </div>
          </section>

          <section>
            <SectionHeader
              icon={UsersRound}
              title="Mis equipos"
              description="Equipos a los que perteneces dentro de la organización."
            />

            <div className="grid gap-4 md:grid-cols-2">
              {teams.map((team) => {
                let members = 0;

                if (team._count?.knowledge_team_members) {
                  members = team._count.knowledge_team_members;
                }

                if (team.knowledge_team_members) {
                  members = team.knowledge_team_members.length;
                }

                return (
                  <article
                    key={team.id}
                    className="rounded-2xl border border-border bg-card p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{team.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {team.description || "Sin descripción."}
                        </p>
                      </div>

                      <button className="rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <Metric label="Miembros" value={String(members)} />
                      <Metric label="Cursos" value="-" />
                      <Metric label="Actividad" value="-" />
                    </div>

                    <form
                      action={addKnowledgeTeamMemberAction}
                      className="mt-5 flex gap-2"
                    >
                      <input type="hidden" name="teamId" value={team.id} />

                      <input
                        name="email"
                        type="email"
                        placeholder="email@empresa.com"
                        required
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                      />

                      <Button type="submit" variant="outline" size="sm">
                        Invitar
                      </Button>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeader
              icon={GraduationCap}
              title="Mis cursos"
              description="Cursos asignados y progreso de aprendizaje."
            />

            <div className="grid gap-4 md:grid-cols-2">
              {courses.map((course) => (
                <article
                  key={course.title}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{course.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {course.status}
                      </p>
                    </div>

                    <Button variant="outline" size="sm">
                      Continuar
                    </Button>
                  </div>

                  <div className="mt-5">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Progreso</span>
                      <span>{course.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface">
                      <div
                        className="h-2 rounded-full bg-lesson"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="rounded-2xl border border-border bg-card p-6">
              <SectionHeader
                icon={FileText}
                title="Mi aportación al Knowledge"
                description="Actividad relacionada con el repositorio de conocimiento."
              />

              <div className="grid gap-4 md:grid-cols-4">
                <Metric label="Documentos subidos" value="6" />
                <Metric label="Knowledge generado" value="9" />
                <Metric label="Revisiones" value="2" />
                <Metric label="Sugerencias" value="3" />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <SectionHeader
                icon={Activity}
                title="Actividad reciente"
                description="Últimos movimientos de tu espacio."
              />

              <div className="space-y-3">
                {activity.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}