// components/home/organization/organization-view.tsx

import {
  Building2,
  UsersRound,
} from "lucide-react";

import { getWorkspaceMembers } from "@/lib/repositories/workspace.repository";
import { listTeams } from "@/lib/services/knowledge-team.service";

type Props = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
};

export async function OrganizationView({
  userId,
  workspaceId,
  workspaceName,
}: Props) {
  const [members, teams] =
    await Promise.all([
      getWorkspaceMembers(workspaceId),
      listTeams({
        userId,
        workspaceId,
      }),
    ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pt-6">
      <section className="rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-medium text-slate-500">
          Espacio de trabajo
        </p>

        <h2 className="mt-1 text-lg font-semibold text-slate-950">
          {workspaceName}
        </h2>

        <div className="mt-5 flex flex-wrap gap-6">
          <Summary
            icon={UsersRound}
            value={members.length}
            label="Personas"
          />

          <Summary
            icon={Building2}
            value={teams.length}
            label="Equipos"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-950">
            Personas
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Miembros del espacio de trabajo.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {member.users.name ||
                    member.users.email}
                </p>

                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {member.users.email}
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-950">
            Equipos
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Equipos existentes en este espacio.
          </p>
        </div>

        {teams.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {teams.map((team) => (
              <div
                key={team.id}
                className="px-5 py-3"
              >
                <p className="text-sm font-medium text-slate-900">
                  {team.name}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-slate-500">
            Todavía no hay equipos creados.
          </p>
        )}
      </section>
    </div>
  );
}

function Summary({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UsersRound;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0A58FF]">
        <Icon className="h-4 w-4" />
      </div>

      <div>
        <p className="text-base font-semibold text-slate-950">
          {value}
        </p>

        <p className="text-xs text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}